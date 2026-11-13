// A fake GitLab issue tracker for the verdict script's tests: an HTTP server
// on localhost that answers the REST API v4 endpoints the script calls, keeps
// its issues in memory and logs every request it receives. Like GitLab, it
// names a project by its URL-encoded path or its ID, lists issues and notes
// newest first unless asked otherwise, pages lists through the Link header,
// adds a system note when an issue closes or reopens, answers a bad parameter
// with 400, and refuses a wrong token with 401. It takes an access token in
// the PRIVATE-TOKEN header or as a bearer token. When readOnly, it refuses
// every write with 403. `jobToken`, when given, is a CI/CD job token, sent in
// the JOB-TOKEN header, that may list issues and do nothing else, as one
// granted the fine-grained Read work items permission can. `refuse` picks
// other requests to refuse with 403: it is given each request's
// { method, path, action } and returns true to refuse it.
//
// Its `records` view and each logged request's `action` read the same as
// fake-github.mjs's, so one test can check either tracker.
import { createServer } from 'node:http';

const OPEN = { open: 'opened', closed: 'closed' };

export const startFakeGitLab = async ({
  repo = 'acme/shop',
  projectId = 42,
  token = 'fake-token',
  jobToken,
  readOnly = false,
  refuse = () => false,
  records = [],
} = {}) => {
  const issues = [];
  const requests = [];
  let noteIds = 0;
  let base;

  const note = (body, system = false) => {
    const id = ++noteIds;
    return { id, body, system, created_at: new Date(Date.UTC(2026, 0, 1) + id * 1000).toISOString() };
  };
  const addIssue = ({ title, body = '', state = 'open', labels = ['flaky-test'], comments = [] }) => {
    const issue = { iid: issues.length + 1, title, description: body, state: OPEN[state], labels: [...labels], notes: comments.map((each) => note(each)) };
    issues.push(issue);
    return issue;
  };
  for (const record of records) addIssue(record);

  const webUrl = (issue) => `${base}/${repo}/-/issues/${issue.iid}`;
  const issueJson = (issue) => ({
    id: 1000 + issue.iid,
    iid: issue.iid,
    project_id: projectId,
    title: issue.title,
    description: issue.description,
    state: issue.state,
    labels: [...issue.labels],
    web_url: webUrl(issue),
  });
  const noteJson = (issue, { id, body, system, created_at }) => ({
    id,
    body,
    system,
    created_at,
    noteable_type: 'Issue',
    noteable_iid: issue.iid,
  });

  const send = (res, status, data, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(JSON.stringify(data));
  };

  // One page of items, with a Link header naming the pages around it, as
  // GitLab's offset pagination gives.
  const sendPage = (res, url, items) => {
    const perPage = Math.min(Number(url.searchParams.get('per_page')) || 20, 100);
    const page = Number(url.searchParams.get('page')) || 1;
    const last = Math.max(1, Math.ceil(items.length / perPage));
    const at = (number) => {
      const link = new URL(url);
      link.searchParams.set('page', String(number));
      link.searchParams.set('per_page', String(perPage));
      return link;
    };
    const links = [];
    if (page > 1) links.push(`<${at(page - 1)}>; rel="prev"`);
    if (page < last) links.push(`<${at(page + 1)}>; rel="next"`);
    links.push(`<${at(1)}>; rel="first"`, `<${at(last)}>; rel="last"`);
    send(res, 200, items.slice((page - 1) * perPage, page * perPage), {
      link: links.join(', '),
      'x-page': String(page),
      'x-per-page': String(perPage),
      'x-next-page': page < last ? String(page + 1) : '',
      'x-total': String(items.length),
    });
  };

  // Comma-separated label names, or an array of them, as GitLab takes both.
  const labelList = (value) =>
    (Array.isArray(value) ? value : String(value).split(',')).map((label) => label.trim()).filter(Boolean);

  // What a request asks the tracker to do, in the words fake-github.mjs uses.
  const actionOf = (method, iid, sub, body) => {
    if (sub === 'notes') return { GET: 'list comments', POST: 'add comment' }[method];
    if (sub) return undefined;
    if (!iid) return { GET: 'list records', POST: 'create record' }[method];
    if (method !== 'PUT' || !body) return undefined;
    const actions = [];
    if (body.state_event) actions.push(`${body.state_event} record`);
    if (body.labels !== undefined) actions.push('set labels');
    if (body.add_labels !== undefined) actions.push('add label');
    if (body.remove_labels !== undefined) actions.push('remove label');
    return actions.join(' and ') || undefined;
  };

  const sorted = (items, url, key) => {
    const sort = url.searchParams.get('sort') ?? 'desc';
    const ordered = [...items].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0));
    return sort === 'asc' ? ordered : ordered.reverse();
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, base);
    let text = '';
    for await (const chunk of req) text += chunk;
    let body;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      return send(res, 400, { error: 'body is not valid JSON' });
    }
    const [api, version, projects, id, resource, iid, sub, ...rest] = url.pathname
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent);
    const action = resource === 'issues' && rest.length === 0 ? actionOf(req.method, iid, sub, body) : undefined;
    requests.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body, action });

    const asUser = req.headers['private-token'] === token || req.headers.authorization === `Bearer ${token}`;
    const asJob = jobToken !== undefined && req.headers['job-token'] === jobToken;
    if (!asUser && !asJob) return send(res, 401, { message: '401 Unauthorized' });
    if ((asJob && action !== 'list records') || (readOnly && req.method !== 'GET')) {
      return send(res, 403, { message: '403 Forbidden' });
    }
    if (refuse({ method: req.method, path: url.pathname, action })) return send(res, 403, { message: '403 Forbidden' });

    if (api !== 'api' || version !== 'v4' || projects !== 'projects') return send(res, 404, { error: '404 Not Found' });
    if (id !== repo && id !== String(projectId)) return send(res, 404, { message: '404 Project Not Found' });
    if (resource !== 'issues' || rest.length > 0) return send(res, 404, { error: '404 Not Found' });
    const issue = iid && issues.find((each) => String(each.iid) === iid);
    if (iid && !issue) return send(res, 404, { message: '404 Not found' });

    if (!iid && req.method === 'GET') {
      const state = url.searchParams.get('state') ?? 'all';
      if (!['opened', 'closed', 'all'].includes(state)) return send(res, 400, { error: 'state does not have a valid value' });
      const labels = labelList(url.searchParams.get('labels') ?? '');
      const found = issues
        .filter((each) => state === 'all' || each.state === state)
        .filter((each) => labels.every((label) => each.labels.includes(label)));
      return sendPage(res, url, sorted(found, url, 'iid').map(issueJson));
    }
    if (!iid && req.method === 'POST') {
      if (!body?.title) return send(res, 400, { error: 'title is missing' });
      const created = addIssue({ title: body.title, body: body.description ?? '', labels: labelList(body.labels ?? '') });
      return send(res, 201, issueJson(created));
    }
    if (!sub && req.method === 'PUT') {
      if (!action) return send(res, 400, { error: 'at least one parameter must be provided' });
      if (body.state_event !== undefined && !['reopen', 'close'].includes(body.state_event)) {
        return send(res, 400, { error: 'state_event does not have a valid value' });
      }
      if (body.state_event === 'reopen' && issue.state === 'closed') {
        issue.state = 'opened';
        issue.notes.push(note('reopened', true));
      }
      if (body.state_event === 'close' && issue.state === 'opened') {
        issue.state = 'closed';
        issue.notes.push(note('closed', true));
      }
      if (body.labels !== undefined) issue.labels = labelList(body.labels);
      for (const label of labelList(body.add_labels ?? '')) if (!issue.labels.includes(label)) issue.labels.push(label);
      const removed = labelList(body.remove_labels ?? '');
      issue.labels = issue.labels.filter((label) => !removed.includes(label));
      return send(res, 200, issueJson(issue));
    }
    if (sub === 'notes' && req.method === 'GET') {
      const sort = url.searchParams.get('sort');
      const orderBy = url.searchParams.get('order_by');
      if (sort !== null && !['asc', 'desc'].includes(sort)) return send(res, 400, { error: 'sort does not have a valid value' });
      if (orderBy !== null && !['created_at', 'updated_at'].includes(orderBy)) {
        return send(res, 400, { error: 'order_by does not have a valid value' });
      }
      return sendPage(res, url, sorted(issue.notes, url, 'created_at').map((each) => noteJson(issue, each)));
    }
    if (sub === 'notes' && req.method === 'POST') {
      if (!body?.body) return send(res, 400, { error: 'body is missing' });
      const added = note(body.body);
      issue.notes.push(added);
      return send(res, 201, noteJson(issue, added));
    }
    return send(res, 404, { error: '404 Not Found' });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  return {
    kind: 'gitlab',
    url: `${base}/api/v4`,
    repo,
    projectId,
    token,
    jobToken,
    requests,
    // The records as the tracker holds them now, in the same shape as
    // fake-github.mjs's: state open or closed, and the bodies of the comments
    // people and scripts wrote, oldest first, without GitLab's system notes.
    get records() {
      return issues.map((issue) => ({
        number: issue.iid,
        title: issue.title,
        body: issue.description,
        state: issue.state === 'opened' ? 'open' : 'closed',
        labels: [...issue.labels],
        comments: issue.notes.filter((each) => !each.system).map((each) => each.body),
        url: webUrl(issue),
      }));
    },
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
};

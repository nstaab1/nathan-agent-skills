// A fake GitHub issue tracker for the verdict script's tests: an HTTP server
// on localhost that answers the REST endpoints the script calls, keeps its
// issues in memory and logs every request it receives. Like GitHub, it pages
// lists through the Link header, refuses a wrong token with 401 and, when
// readOnly, refuses every write with 403, as GitHub does for a fork PR's token.
// `refuse` picks other requests to refuse with 403: it is given each request's
// { method, path, action } and returns true to refuse it.
//
// Its `records` view and each logged request's `action`, which says what the
// request asks the tracker to do, read the same as fake-gitlab.mjs's, so one
// test can check either tracker.
import { createServer } from 'node:http';

// What a request asks the tracker to do, in the words fake-gitlab.mjs uses.
const actionOf = (method, number, sub, rest, body) => {
  if (sub === 'comments' && rest.length === 0) return { GET: 'list comments', POST: 'add comment' }[method];
  if (sub === 'labels') return { POST: 'add label', DELETE: 'remove label' }[method];
  if (sub) return undefined;
  if (!number) return { GET: 'list records', POST: 'create record' }[method];
  if (method !== 'PATCH' || !body) return undefined;
  const actions = [];
  if (body.state) actions.push(body.state === 'open' ? 'reopen record' : 'close record');
  if (body.labels) actions.push('set labels');
  return actions.join(' and ') || undefined;
};

export const startFakeGitHub = async ({
  repo = 'acme/shop',
  token = 'fake-token',
  readOnly = false,
  refuse = () => false,
  records = [],
} = {}) => {
  const issues = [];
  const requests = [];
  let commentIds = 0;
  let base;

  const comment = (body) => ({ id: ++commentIds, body });
  const addIssue = ({ title, body = '', state = 'open', labels = ['flaky-test'], comments = [] }) => {
    const issue = { number: issues.length + 1, title, body, state, labels: [...labels], comments: comments.map(comment) };
    issues.push(issue);
    return issue;
  };
  for (const record of records) addIssue(record);

  const issueJson = (issue) => ({
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    labels: issue.labels.map((name) => ({ name })),
    html_url: `${base}/${repo}/issues/${issue.number}`,
  });
  const commentJson = (issue, { id, body }) => ({ id, body, html_url: `${base}/${repo}/issues/${issue.number}#issuecomment-${id}` });

  const send = (res, status, data, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(JSON.stringify(data));
  };

  // One page of items, with a Link header naming the next page when there is one.
  const sendPage = (res, url, items) => {
    const perPage = Math.min(Number(url.searchParams.get('per_page')) || 30, 100);
    const page = Number(url.searchParams.get('page')) || 1;
    const headers = {};
    if (page * perPage < items.length) {
      const next = new URL(url);
      next.searchParams.set('page', String(page + 1));
      headers.link = `<${next}>; rel="next"`;
    }
    send(res, 200, items.slice((page - 1) * perPage, page * perPage), headers);
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, base);
    let text = '';
    for await (const chunk of req) text += chunk;
    const body = text ? JSON.parse(text) : undefined;
    const prefix = `/repos/${repo}/issues`;
    const [number, sub, ...rest] = url.pathname.startsWith(prefix)
      ? url.pathname.slice(prefix.length).split('/').filter(Boolean)
      : [];
    const action = url.pathname.startsWith(prefix) ? actionOf(req.method, number, sub, rest, body) : undefined;
    requests.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body, action });

    const auth = req.headers.authorization;
    if (auth !== `Bearer ${token}` && auth !== `token ${token}`) return send(res, 401, { message: 'Bad credentials' });
    if ((readOnly && req.method !== 'GET') || refuse({ method: req.method, path: url.pathname, action })) {
      return send(res, 403, { message: 'Resource not accessible by integration' });
    }

    if (!url.pathname.startsWith(prefix)) return send(res, 404, { message: 'Not Found' });
    const issue = number && issues.find((each) => each.number === Number(number));
    if (number && !issue) return send(res, 404, { message: 'Not Found' });

    if (!number && req.method === 'GET') {
      const state = url.searchParams.get('state') || 'open';
      const labels = (url.searchParams.get('labels') || '').split(',').filter(Boolean);
      const found = issues
        .filter((each) => state === 'all' || each.state === state)
        .filter((each) => labels.every((label) => each.labels.includes(label)))
        .reverse();
      return sendPage(res, url, found.map(issueJson));
    }
    if (!number && req.method === 'POST') {
      return send(res, 201, issueJson(addIssue({ title: body.title, body: body.body, labels: body.labels ?? [] })));
    }
    if (!sub && rest.length === 0 && req.method === 'PATCH') {
      if (body.state) issue.state = body.state;
      if (body.labels) issue.labels = body.labels.map((label) => (typeof label === 'string' ? label : label.name));
      return send(res, 200, issueJson(issue));
    }
    if (sub === 'labels' && rest.length === 0 && req.method === 'POST') {
      for (const label of body.labels) if (!issue.labels.includes(label)) issue.labels.push(label);
      return send(res, 200, issue.labels.map((name) => ({ name })));
    }
    if (sub === 'labels' && rest.length === 1 && req.method === 'DELETE') {
      const label = decodeURIComponent(rest[0]);
      if (!issue.labels.includes(label)) return send(res, 404, { message: 'Label does not exist' });
      issue.labels = issue.labels.filter((each) => each !== label);
      return send(res, 200, issue.labels.map((name) => ({ name })));
    }
    if (sub === 'comments' && rest.length === 0 && req.method === 'GET') {
      return sendPage(res, url, issue.comments.map((each) => commentJson(issue, each)));
    }
    if (sub === 'comments' && rest.length === 0 && req.method === 'POST') {
      const added = comment(body.body);
      issue.comments.push(added);
      return send(res, 201, commentJson(issue, added));
    }
    return send(res, 404, { message: 'Not Found' });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  return {
    kind: 'github',
    url: base,
    repo,
    token,
    requests,
    // The records as the tracker holds them now, each with its comment bodies.
    get records() {
      return issues.map(({ number, title, body, state, labels, comments }) => ({
        number,
        title,
        body,
        state,
        labels: [...labels],
        comments: comments.map((each) => each.body),
        url: `${base}/${repo}/issues/${number}`,
      }));
    },
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
};

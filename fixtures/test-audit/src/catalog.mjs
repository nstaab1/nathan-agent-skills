export function createCatalog(books) {
  const byId = new Map(books.map((book) => [book.id, book]));
  return {
    find: (id) => byId.get(id),
  };
}

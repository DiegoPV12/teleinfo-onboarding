export function createTimers() {
  let ids = [];
  return {
    after(fn, ms) {
      const id = setTimeout(fn, ms);
      ids.push(id);
      return id;
    },
    clear() {
      ids.forEach(clearTimeout);
      ids = [];
    }
  };
}


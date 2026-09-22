/**
 * Installs a hook on IndexedDB reads and writes before any app code runs, so
 * a test can make one specific operation fail (or come back empty) on
 * demand, the way a quota error, a blocked `versionchange`, a vanished row,
 * or IndexedDB connection loss after the Android app is backgrounded would.
 * Armed and disarmed through `window.__fankaFaults` from `page.evaluate`.
 * Shared by review.spec.ts and browse.spec.ts.
 *
 * - `failSessionReads`: how many reads of the persisted session to reject.
 *   Only `restore()` reads that key, so seeding and the Today page's counts
 *   are unaffected.
 * - `missingCards`: while true, every read of the `cards` store resolves to
 *   nothing, as if the row were gone.
 * - `failReviewPuts`: how many writes to the `reviews` store to reject.
 *   `reviews.record()`'s transaction is the only writer, so this fails a
 *   grade before anything in it is written (the `items` write inside the
 *   same transaction precedes it, but the transaction only commits once
 *   every write in it succeeds).
 * - `failCardScans`: while true, every whole-store read of `cards`
 *   (`getAll`/`openCursor` — what `cards.list` and Browse's table read
 *   through) rejects. A boolean gate, flipped from the test, rather than a
 *   use-count budget: seeding and the due counts scan the same store.
 * - `failItemPuts`: how many writes to the `items` store to reject. Both
 *   `reviews.record()` and `reviews.undo()` write `items` — arm this only
 *   once the state under test (e.g. a card already graded) is in place, so
 *   it fails the operation actually being tested rather than an earlier one.
 */
export async function installReadFaults(
  page: import('@playwright/test').Page,
  initial: { failSessionReads?: number; failReviewPuts?: number; failItemPuts?: number },
) {
  await page.addInitScript(
    (init) => {
      const faults = { ...init, missingCards: false, failCardScans: false };
      (window as unknown as { __fankaFaults: typeof faults }).__fankaFaults = faults;
      const get = IDBObjectStore.prototype.get;
      IDBObjectStore.prototype.get = function (this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
        if (this.name === 'settings' && key === 'session' && faults.failSessionReads > 0) {
          faults.failSessionReads -= 1;
          throw new DOMException('Injected read failure', 'UnknownError');
        }
        if (this.name === 'cards' && faults.missingCards) return get.call(this, '￿-no-such-card');
        return get.call(this, key);
      };
      const getAll = IDBObjectStore.prototype.getAll;
      IDBObjectStore.prototype.getAll = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['getAll']>) {
        if (this.name === 'cards' && faults.failCardScans) throw new DOMException('Injected read failure', 'UnknownError');
        return getAll.apply(this, args);
      };
      const openCursor = IDBObjectStore.prototype.openCursor;
      IDBObjectStore.prototype.openCursor = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['openCursor']>) {
        if (this.name === 'cards' && faults.failCardScans) throw new DOMException('Injected read failure', 'UnknownError');
        return openCursor.apply(this, args);
      };
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
        if (this.name === 'reviews' && faults.failReviewPuts > 0) {
          faults.failReviewPuts -= 1;
          throw new DOMException('Injected write failure', 'UnknownError');
        }
        if (this.name === 'items' && faults.failItemPuts > 0) {
          faults.failItemPuts -= 1;
          throw new DOMException('Injected write failure', 'UnknownError');
        }
        return put.call(this, value, key);
      };
    },
    {
      failSessionReads: initial.failSessionReads ?? 0,
      failReviewPuts: initial.failReviewPuts ?? 0,
      failItemPuts: initial.failItemPuts ?? 0,
    },
  );
}

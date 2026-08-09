const DB_NAME = "padronDB";
const DB_VERSION = 2;
const STORE_NAME = "padronPayload";
const CURRENT_KEY = "current";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // La versión anterior guardaba miles de filas individualmente.
      if (db.objectStoreNames.contains("padronStore")) {
        db.deleteObjectStore("padronStore");
      }

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePadron(padron, cacheVersion) {
  if (navigator.storage?.persist) {
    try {
      await navigator.storage.persist();
    } catch {
      // El caché funciona aunque el navegador no otorgue persistencia.
    }
  }

  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    // Un solo registro evita 170 mil operaciones individuales en IndexedDB.
    store.put({
      id: CURRENT_KEY,
      version: cacheVersion,
      total: padron.length,
      savedAt: Date.now(),
      data: padron,
    });

    tx.oncomplete = () => {
      db.close();
      resolve(true);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function getAllPadron(cacheVersion, expectedTotal) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(CURRENT_KEY);

    request.onsuccess = () => {
      const cached = request.result;
      db.close();

      if (
        cached?.version === cacheVersion &&
        cached?.total === expectedTotal &&
        Array.isArray(cached?.data)
      ) {
        resolve(cached.data);
        return;
      }

      resolve([]);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

const DB_NAME = "PadronDB";
const DB_VERSION = 2;
const STORE_NAME = "padron";
const CACHE_KEY = "full";

const openPadronDB = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // La versión anterior guardaba cada persona por separado. Un único payload
      // reduce drásticamente el tiempo de lectura/escritura de 170 mil registros.
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      db.createObjectStore(STORE_NAME);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export const readPadronCache = async () => {
  const db = await openPadronDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(CACHE_KEY);

    request.onsuccess = () => {
      db.close();
      resolve(request.result || null);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
};

export const savePadronCache = async ({ version, data }) => {
  if (navigator.storage?.persist) {
    try {
      await navigator.storage.persist();
    } catch {
      // El caché sigue funcionando aunque el navegador no otorgue persistencia.
    }
  }

  const db = await openPadronDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(
      {
        version,
        total: data.length,
        savedAt: Date.now(),
        data,
      },
      CACHE_KEY
    );

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
};

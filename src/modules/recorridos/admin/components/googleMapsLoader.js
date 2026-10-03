// Carga perezosa y compartida de la API de Google Maps, usada tanto por el
// mapa en vivo como por el replay. Un solo Loader/promesa por página — @googlemaps/js-api-loader
// ya es idempotente si se le pide cargar dos veces con las mismas opciones,
// pero esto evita de todos modos importar el paquete dos veces desde dos
// componentes distintos.
const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

let promesa = null;

export const hayClaveGoogleMaps = () => Boolean(API_KEY);

export const cargarGoogleMaps = async () => {
  if (!promesa) {
    const { Loader } = await import("@googlemaps/js-api-loader");
    promesa = new Loader({ apiKey: API_KEY, version: "weekly" }).load();
  }
  return promesa;
};

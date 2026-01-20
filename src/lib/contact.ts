/**
 * Contact information constants for Club Deportivo Norte
 * Centralized location for all contact details to make updates easier
 */

export const CONTACT = {
  email: 'admdeportivonorte@gmail.com',
  phone: {
    display: '+54 9 223 585-0294',
    link: '+5492235850294',
  },
  social: {
    instagram: 'https://www.instagram.com/depnorte/',
    facebook: 'https://www.facebook.com/depnorteoficial',
    youtube: 'https://www.youtube.com/@DeportivoNorte',
  },
  location: {
    name: 'Estadio Carlos H. Miori',
    address: 'RP2 km 393, Mar del Plata, Provincia de Buenos Aires',
    mapsUrl: 'https://maps.app.goo.gl/AWefm6d3yAD4Rhw28',
  },
  forms: {
    membership: 'https://docs.google.com/forms/d/e/1FAIpQLSdjUjWomnygFy_uXQyg9LXq-WRbDDpTOw2sqENAi1cxbYOBsw/viewform',
  },
} as const;

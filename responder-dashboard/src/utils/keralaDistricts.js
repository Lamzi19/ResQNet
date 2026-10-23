// Kerala State Districts Geographic Configuration and Disaster Monitoring Metadata
export const KERALA_DISTRICTS = [
  {
    id: "all",
    name: "All Kerala (State Overview)",
    shortName: "All Kerala",
    center: [10.4500, 76.4000],
    zoom: 8,
    floodZone: "State-wide flood monitoring & coastal basin surveillance",
    activeBases: 14
  },
  {
    id: "ernakulam",
    name: "Ernakulam (Kochi / Aluva)",
    shortName: "Ernakulam",
    center: [10.0500, 76.3500],
    zoom: 12,
    floodZone: "Periyar River & Muvattupuzha River basin; Aluva & Kalamassery lowlands",
    activeBases: 4
  },
  {
    id: "alappuzha",
    name: "Alappuzha (Kuttanad / Chengannur)",
    shortName: "Alappuzha",
    center: [9.4981, 76.4388],
    zoom: 12,
    floodZone: "Kuttanad below sea level basin, Vembanad backwaters, Pamba delta",
    activeBases: 5
  },
  {
    id: "wayanad",
    name: "Wayanad (Meppadi / Kalpetta)",
    shortName: "Wayanad",
    center: [11.6450, 76.1320],
    zoom: 12,
    floodZone: "Kabini River catchment, Chooralmala-Meppadi flash torrent zone",
    activeBases: 3
  },
  {
    id: "pathanamthitta",
    name: "Pathanamthitta (Ranni / Pamba)",
    shortName: "Pathanamthitta",
    center: [9.2800, 76.7870],
    zoom: 12,
    floodZone: "Pamba & Achankovil River overflow paths, Kakki dam drainage",
    activeBases: 3
  },
  {
    id: "thrissur",
    name: "Thrissur (Chalakudy / Puzhakkal)",
    shortName: "Thrissur",
    center: [10.3500, 76.3200],
    zoom: 12,
    floodZone: "Chalakudy River & Sholayar overflow plains, Kole wetlands",
    activeBases: 3
  },
  {
    id: "kottayam",
    name: "Kottayam (Meenachil / Pala)",
    shortName: "Kottayam",
    center: [9.5916, 76.5422],
    zoom: 12,
    floodZone: "Meenachil River overflow, Vaikom-Thalayolaparambu lakeside floodplains",
    activeBases: 2
  },
  {
    id: "idukki",
    name: "Idukki (Munnar / Cheruthoni)",
    shortName: "Idukki",
    center: [9.9189, 76.9744],
    zoom: 11,
    floodZone: "Periyar dam catchment, Muthirapuzha & Cheruthoni high-runoff gorge",
    activeBases: 2
  },
  {
    id: "malappuram",
    name: "Malappuram (Nilambur / Ponnani)",
    shortName: "Malappuram",
    center: [11.0510, 76.0711],
    zoom: 12,
    floodZone: "Chaliyar & Kadalundi rivers, Ponnani coastal backwater spill",
    activeBases: 2
  },
  {
    id: "kozhikode",
    name: "Kozhikode (Beypore / Chaliyar)",
    shortName: "Kozhikode",
    center: [11.2588, 75.8204],
    zoom: 12,
    floodZone: "Iruvanjippuzha & Chaliyar confluence, Mavoor floodplain",
    activeBases: 2
  },
  {
    id: "palakkad",
    name: "Palakkad (Bharathapuzha)",
    shortName: "Palakkad",
    center: [10.7867, 76.6548],
    zoom: 12,
    floodZone: "Bharathapuzha (Nila) riverbed, Malampuzha reservoir catchment",
    activeBases: 2
  },
  {
    id: "kollam",
    name: "Kollam (Munroe Island / Ashtamudi)",
    shortName: "Kollam",
    center: [8.9800, 76.6400],
    zoom: 12,
    floodZone: "Ashtamudi Lake estuarine islands, Kallada river basin",
    activeBases: 2
  },
  {
    id: "thiruvananthapuram",
    name: "Thiruvananthapuram (Neyyar / Karamana)",
    shortName: "Thiruvananthapuram",
    center: [8.5241, 76.9366],
    zoom: 12,
    floodZone: "Karamana River, Neyyar lowlands, coastal flood estuaries",
    activeBases: 2
  },
  {
    id: "kannur",
    name: "Kannur (Iritty / Valapattanam)",
    shortName: "Kannur",
    center: [11.8745, 75.4704],
    zoom: 12,
    floodZone: "Valapattanam & Kuppam river basin, Iritty hillstream runoff",
    activeBases: 2
  },
  {
    id: "kasaragod",
    name: "Kasaragod (Chandragiri / Hosdurg)",
    shortName: "Kasaragod",
    center: [12.4996, 75.0500],
    zoom: 12,
    floodZone: "Chandragiri & Tejaswini rivers, coastal backwater swamps",
    activeBases: 1
  }
];

export function getDistrictById(id) {
  return KERALA_DISTRICTS.find((d) => d.id === (id || "all")) || KERALA_DISTRICTS[0];
}

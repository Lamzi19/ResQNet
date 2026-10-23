import { KERALA_DISTRICTS } from "./keralaDistricts";

// District-specific locality names, landmarks, and river names to generate authentic Kerala scenarios
const DISTRICT_LOCALITIES = {
  ernakulam: {
    river: "Periyar & Muvattupuzha River",
    localities: [
      "Aluva Bank Colony", "Kalamassery Eloor Ferry", "North Paravur Varapuzha",
      "Angamaly Champannoor", "Muvattupuzha River Road", "Kaloor Lowlands",
      "Kothamangalam Karukadam", "Fort Kochi Coastal Strip", "Edappally Toll Canal",
      "Cheranalloor Island", "Thiruvankulam", "Perumbavoor Vallam",
      "Chittoor Ferry", "Piravom Riverfront", "Manjummel Bund"
    ],
    shelters: [
      { name: "Aluva Govt Girls Higher Secondary School Camp", capacity: 450, occupied: 180, lat: 10.1140, lng: 76.3610 },
      { name: "UC College Flood Relief Shelter", capacity: 600, occupied: 290, lat: 10.1250, lng: 76.3420 },
      { name: "Kalamassery Town Hall Relief Center", capacity: 350, occupied: 120, lat: 10.0580, lng: 76.3280 },
      { name: "Varapuzha St. Joseph Parish Hall Shelter", capacity: 400, occupied: 210, lat: 10.0750, lng: 76.2890 }
    ],
    bases: [
      "Aluva Fire Station Staging Dock", "Munambam Marine Police Wharf",
      "Kochi Naval Base Jetty", "Eloor Industrial Port Dock", "Kalamassery Canal Depot"
    ]
  },
  alappuzha: {
    river: "Pamba River & Vembanad Lake",
    localities: [
      "Nedumudi Ward 4", "Chambakulam Riverbank", "Pulinkunnoo Island",
      "Kainakary Padasekharam", "Edathua Church Road", "Moncompu Lowland",
      "Chengannur Pandanad", "Thalavady Village", "Ambalappuzha Sea Shore",
      "Kavalam Ferry", "Mavelikkara Riverbend", "Chennithala Bund",
      "Veeyapuram Spillway", "Ramankary Canal East", "Champakulam St. Marys"
    ],
    shelters: [
      { name: "SDV College Ambalappuzha Evacuation Camp", capacity: 500, occupied: 310, lat: 9.4980, lng: 76.3550 },
      { name: "Moncompu Agricultural Research Camp", capacity: 400, occupied: 240, lat: 9.4750, lng: 76.4420 },
      { name: "Chengannur Engineering College Relief Center", capacity: 700, occupied: 460, lat: 9.3180, lng: 76.6120 },
      { name: "Edathua St. Aloysius Camp", capacity: 450, occupied: 195, lat: 9.3620, lng: 76.4710 }
    ],
    bases: [
      "Nedumudi Staging Outpost", "Chengannur Bridge Marine Depot",
      "Alappuzha Bunder Port", "Edathua River Police Dock", "Kainakary Water Gate"
    ]
  },
  wayanad: {
    river: "Kabini River & Chaliyar Hillstreams",
    localities: [
      "Chooralmala Riverside", "Meppadi Tea Estate Ward", "Mundakkai Valley",
      "Kalpetta Bypass Lowland", "Vythiri Highstream", "Panamaram River Bend",
      "Mananthavady Valliyoorkavu", "Sulthan Bathery Riverbank", "Pulpally Forest Border",
      "Padinjarathara Dam Basin", "Pozhuthana Plantation", "Meenangadi Stream Road",
      "Ambalavayal Farm Settlement", "Thariode Waterway", "Kaniyambetta"
    ],
    shelters: [
      { name: "Meppadi Govt Higher Secondary School Camp", capacity: 550, occupied: 380, lat: 11.5620, lng: 76.1340 },
      { name: "Kalpetta Town Hall Emergency Camp", capacity: 400, occupied: 175, lat: 11.6110, lng: 76.0880 },
      { name: "Vythiri Community Hall Relief Shelter", capacity: 350, occupied: 220, lat: 11.5520, lng: 76.0410 },
      { name: "Mananthavady St. Patrick School Shelter", capacity: 500, occupied: 290, lat: 11.8050, lng: 76.0080 }
    ],
    bases: [
      "Meppadi Disaster Relief Staging Base", "Kalpetta Fire Command Post",
      "Panamaram River Wharf", "Vythiri Fast-Response Depot", "Banaasura Basin Camp"
    ]
  },
  pathanamthitta: {
    river: "Pamba & Achankovil River",
    localities: [
      "Ranni Main Market", "Perunad Riverfront", "Aranmula Temple Road",
      "Kozhencherry Bridge Post", "Vadasserikkara Confluence", "Thiruvalla Manjadi",
      "Mallappally Riverbank", "Pandalam Bridge Lowland", "Seethathode Waterway",
      "Angadi Ward 2", "Kottangal", "Vechoochira Settlement",
      "Ayroor Cherukolpuzha", "Konni River Forest", "Kadapra Lowland"
    ],
    shelters: [
      { name: "Ranni MS Higher Secondary School Camp", capacity: 500, occupied: 340, lat: 9.3890, lng: 76.7910 },
      { name: "Kozhencherry St. Thomas College Camp", capacity: 600, occupied: 280, lat: 9.3420, lng: 76.7110 },
      { name: "Thiruvalla Mar Thoma Auditorium Camp", capacity: 450, occupied: 160, lat: 9.3850, lng: 76.5780 },
      { name: "Aranmula Parish Hall Shelter", capacity: 350, occupied: 190, lat: 9.3310, lng: 76.6850 }
    ],
    bases: [
      "Ranni Pamba Bridge Outpost", "Aranmula River Base",
      "Kozhencherry Marine Post", "Thiruvalla Canal Base", "Konni Fast Skiff Post"
    ]
  },
  thrissur: {
    river: "Chalakudy & Karuvannur River",
    localities: [
      "Chalakudy North Bypass", "Puzhakkal Kole Marsh", "Mala Town Waterway",
      "Kodungallur River Estuary", "Irinjalakuda Lowland", "Athirappilly Foot Road",
      "Ollur Stream Crossing", "Kattoor Bund", "Annamanada River Curve",
      "Peringalkuthu Drainage", "Cherpu Paddy Basin", "Chavakkad Beach Backwater",
      "Wadakkanchery Riverway", "Viyyoor Flood Road", "Ayyanthole"
    ],
    shelters: [
      { name: "Chalakudy Carmelite Convent Higher Secondary School", capacity: 600, occupied: 390, lat: 10.3200, lng: 76.3410 },
      { name: "Puzhakkal Community Relief Hall", capacity: 400, occupied: 190, lat: 10.5350, lng: 76.1950 },
      { name: "Mala Holy Grace Relief Camp", capacity: 450, occupied: 230, lat: 10.2180, lng: 76.2950 },
      { name: "Kodungallur Model Boys School Shelter", capacity: 500, occupied: 280, lat: 10.2280, lng: 76.1980 }
    ],
    bases: [
      "Chalakudy River Bridge Station", "Kodungallur Marine Wharf",
      "Puzhakkal Kole Rescue Station", "Mala Fire Outpost", "Athirappilly Torrent Post"
    ]
  }
};

// Generic generator for other districts
function getDistrictMetadata(districtId) {
  if (DISTRICT_LOCALITIES[districtId]) {
    return DISTRICT_LOCALITIES[districtId];
  }
  const d = KERALA_DISTRICTS.find((x) => x.id === districtId) || KERALA_DISTRICTS[1];
  const [cLat, cLng] = d.center;
  return {
    river: d.floodZone.split(";")[0] || "Major Kerala River",
    localities: [
      `${d.shortName} Riverfront Ward 1`, `${d.shortName} Canal Colony`, `${d.shortName} Market Lowlands`,
      `${d.shortName} Bridge Outpost`, `${d.shortName} West Bund`, `${d.shortName} East Padi`,
      `${d.shortName} Hospital Road`, `${d.shortName} Coastal Hamlet`, `${d.shortName} Ward 7`,
      `${d.shortName} Ferry Junction`, `${d.shortName} Backwater Shore`, `${d.shortName} Old Town`,
      `${d.shortName} High School Road`, `${d.shortName} Railway Underpass`, `${d.shortName} Temple Colony`
    ],
    shelters: [
      { name: `${d.shortName} Govt Boys High School Relief Camp`, capacity: 500, occupied: 260, lat: cLat + 0.015, lng: cLng + 0.012 },
      { name: `${d.shortName} Town Hall Emergency Shelter`, capacity: 400, occupied: 195, lat: cLat - 0.012, lng: cLng - 0.015 },
      { name: `${d.shortName} Parish Community Center`, capacity: 350, occupied: 140, lat: cLat + 0.022, lng: cLng - 0.018 }
    ],
    bases: [
      `${d.shortName} Fire Station Staging Dock`, `${d.shortName} Coastal Police Wharf`,
      `${d.shortName} Disaster Command Jetty`, `${d.shortName} Civil Defence Depot`
    ]
  };
}

const EMERGENCY_TEMPLATES = [
  { cat: "trapped", desc: "Water rose above 4 feet; family stranded on terrace unable to exit.", pMin: 3, pMax: 6, prio: 92, vul: ["rising_flood", "child"] },
  { cat: "injured", desc: "Elderly resident slipped during flood evacuation; fractured hip, needs stretcher rescue.", pMin: 2, pMax: 3, prio: 88, vul: ["elderly", "medical_emergency"] },
  { cat: "medical", desc: "Bedridden patient requires dialysis support; oxygen cylinder running low.", pMin: 2, pMax: 4, prio: 95, vul: ["bedridden", "medical_emergency"] },
  { cat: "trapped", desc: "Mudflow and strong currents blocked access bridge; 5 farm workers marooned.", pMin: 4, pMax: 7, prio: 86, vul: ["cut_off", "debris_flow"] },
  { cat: "supplies", desc: "Submerged island hamlet; drinking water well contaminated, infants need baby food & water.", pMin: 5, pMax: 8, prio: 74, vul: ["infant", "no_water"] },
  { cat: "evacuation", desc: "Water entering compound at 2 inches/hour; requesting boat extraction before dark.", pMin: 2, pMax: 5, prio: 68, vul: [] },
  { cat: "trapped", desc: "Two elderly persons in single-story house; water level at window sill.", pMin: 2, pMax: 3, prio: 82, vul: ["elderly"] },
  { cat: "supplies", desc: "Elderly couple isolated on 1st floor; dry food and essential cardiac medicines needed.", pMin: 2, pMax: 2, prio: 54, vul: ["elderly"] },
  { cat: "evacuation", desc: "Pregnant woman experiencing labor pains; road to district hospital cut off by flood.", pMin: 3, pMax: 4, prio: 98, vul: ["pregnant", "medical_emergency"] },
  { cat: "information", desc: "Requesting safest boat pickup coordinate for 3 families near church hall.", pMin: 6, pMax: 10, prio: 42, vul: [] },
  { cat: "trapped", desc: "Shopkeepers trapped on upper floor as river breach entered commercial market.", pMin: 3, pMax: 5, prio: 76, vul: [] },
  { cat: "evacuation", desc: "Water entered cattle shed and ground floor; requesting shallow skiff evacuation.", pMin: 3, pMax: 4, prio: 62, vul: ["livestock"] },
  { cat: "medical", desc: "Snakebite incident in waterlogged home; anti-venom required urgently.", pMin: 2, pMax: 3, prio: 94, vul: ["snake_bite", "medical_emergency"] },
  { cat: "supplies", desc: "Family with 3 small children on roof; no food for past 18 hours.", pMin: 5, pMax: 6, prio: 78, vul: ["child", "no_food"] }
];

const BOAT_NAMES_POOL = [
  { name: "Kerala Fire & Rescue Gemini-01", agency: "Kerala Fire & Emergency Services", type: "Motorized Inflatable Gemini", cap: 8 },
  { name: "Matsyathozhilali Marine Rescue-04", agency: "Kerala Fishermen Disaster Taskforce (Matsyafed)", type: "Deep-Sea Marine Rescue Craft", cap: 12 },
  { name: "NDRF 04 Bn Rapid Inflatable Delta", agency: "National Disaster Response Force (NDRF)", type: "Inflatable Rescue Boat (IRB)", cap: 10 },
  { name: "Navy Southern Command RIB-Sanjivani", agency: "Indian Navy (Naval Disaster Task Force)", type: "Heavy Rigid Inflatable (RIB)", cap: 14 },
  { name: "SDRF Kerala FloodSkiff-03", agency: "State Disaster Response Force (SDRF)", type: "Shallow-Draft Aluminum Skiff", cap: 8 },
  { name: "Kerala Civil Defence Zodiac-02", agency: "Kerala Civil Defence & Aapda Mitra", type: "Torrent Zodiac Craft", cap: 6 },
  { name: "Matsyathozhilali Coastal Pride-08", agency: "Kerala Fishermen Disaster Taskforce (Matsyafed)", type: "High-Buoyancy Marine Skiff", cap: 14 },
  { name: "Coast Guard Air-Sea Rescue Skiff", agency: "Indian Coast Guard Squadron", type: "Fast Tactical RIB", cap: 10 },
  { name: "Kerala Police Coastal Interceptor-05", agency: "Coastal Security Police", type: "Twin-Engine Deep RIB", cap: 10 },
  { name: "Fire & Rescue Hydro-Craft 07", agency: "Kerala Fire & Emergency Services", type: "Shallow Water Hydro-Craft", cap: 8 },
  { name: "NDRF Alpha Evacuation Craft", agency: "National Disaster Response Force (NDRF)", type: "Heavy Multi-Person IRB", cap: 12 },
  { name: "SDRF Pamba-Relief Skiff", agency: "State Disaster Response Force (SDRF)", type: "Aluminum Flood Skiff", cap: 8 },
  { name: "Matsyathozhilali Samudra-11", agency: "Kerala Fishermen Disaster Taskforce (Matsyafed)", type: "Heavy Sea-Rescue Boat", cap: 16 },
  { name: "Aapda Mitra Fast Response-04", agency: "Kerala Civil Defence Volunteers", type: "Inflatable Zodiac", cap: 6 },
  { name: "Navy Diver Assistance Craft-02", agency: "Indian Navy Clearance Diving Team", type: "Special Ops Assault Boat", cap: 10 }
];

const COMMANDERS = [
  "Station Officer K. P. Manoj", "Skipper Xavier Antony", "Inspector Rajesh Sharma",
  "Lt. Cmdr. V. Nair", "Sub-Insp. S. Pillai", "Lead Volunteer Anoop V.",
  "Capt. Sebastian Joseph", "Coast Guard Chief A. K. Joshi", "ASI B. Sudheesh",
  "Lead Fireman Ramesh K.", "Inspector Gurpreet Singh", "Havildar M. Krishnan",
  "Skipper Jude Fernandez", "Volunteer Coordinator Deepa M.", "Lt. Rohan Mathew"
];

function randomFloat(min, max) {
  return min + Math.random() * (max - min);
}

function randomInt(min, max) {
  return Math.floor(randomFloat(min, max + 1));
}

function levelFromScore(score) {
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}

// Generates 30 to 40 victims and ~15 boats dynamically clustered around the selected district
export function generateDistrictScenario(districtId = "ernakulam", victimCount = 35, boatCount = 15) {
  const district = KERALA_DISTRICTS.find((d) => d.id === districtId) || KERALA_DISTRICTS[1];
  const [cLat, cLng] = district.center;
  const meta = getDistrictMetadata(district.id);

  // 1. Generate Victims / SOS Incidents (30-40 cases)
  const incidents = [];
  const targetVictimCount = Math.max(30, Math.min(42, victimCount));

  for (let i = 1; i <= targetVictimCount; i++) {
    const tmpl = EMERGENCY_TEMPLATES[(i - 1) % EMERGENCY_TEMPLATES.length];
    const locName = meta.localities[(i - 1) % meta.localities.length];
    
    // Spread coordinates around district center with realistic jitter (within ~5-12km)
    const latOffset = randomFloat(-0.065, 0.065);
    const lngOffset = randomFloat(-0.065, 0.065);
    const lat = Number((cLat + latOffset).toFixed(5));
    const lng = Number((cLng + lngOffset).toFixed(5));

    const pCount = randomInt(tmpl.pMin, tmpl.pMax);
    const scoreJitter = randomInt(-6, 6);
    const score = Math.max(12, Math.min(99, tmpl.prio + scoreJitter));
    const level = levelFromScore(score);

    // Initial response status: a couple assigned, 1 rescued, majority unassigned
    let responseStatus = "unassigned";
    let assignedBoatId = null;
    let assignedBoatName = null;
    let missionPhase = null;

    if (i === 1) {
      responseStatus = "assigned";
      assignedBoatId = `BOAT-${district.id.toUpperCase()}-02`;
      assignedBoatName = BOAT_NAMES_POOL[1].name;
      missionPhase = "en_route";
    } else if (i === 2) {
      responseStatus = "assigned";
      assignedBoatId = `BOAT-${district.id.toUpperCase()}-03`;
      assignedBoatName = BOAT_NAMES_POOL[2].name;
      missionPhase = "on_scene";
    } else if (i === targetVictimCount) {
      responseStatus = "rescued";
      missionPhase = "completed";
    }

    incidents.push({
      id: `SOS-${district.shortName.toUpperCase().slice(0, 3)}-${100 + i}`,
      district_id: district.id,
      district_name: district.shortName,
      location_name: `${locName}, ${district.shortName}`,
      created_at: new Date(Date.now() - (i * 3 + randomInt(1, 5)) * 60000).toISOString(),
      latitude: lat,
      longitude: lng,
      category: tmpl.cat,
      description: tmpl.desc,
      people_count: pCount,
      vulnerability_flags: tmpl.vul,
      priority_score: score,
      priority_level: level,
      priority_reasons: [
        `${meta.river} flood impact`,
        score >= 75 ? "Severe inundation" : "Evacuation requested",
        tmpl.vul.length > 0 ? `Vulnerabilities: ${tmpl.vul.join(", ")}` : "High water level"
      ],
      response_status: responseStatus,
      assigned_boat_id: assignedBoatId,
      assigned_boat_name: assignedBoatName,
      mission_phase: missionPhase,
      delivery_status: i % 3 === 0 ? "delayed" : "received",
      hop_count: randomInt(0, 3)
    });
  }

  // 2. Generate Rescue Boats (around 15 boats)
  const boats = [];
  const targetBoatCount = Math.max(12, Math.min(18, boatCount));

  for (let b = 1; b <= targetBoatCount; b++) {
    const boatDef = BOAT_NAMES_POOL[(b - 1) % BOAT_NAMES_POOL.length];
    const baseName = meta.bases[(b - 1) % meta.bases.length];
    const commanderName = COMMANDERS[(b - 1) % COMMANDERS.length];

    // Stationed around district waterways
    const latOffset = randomFloat(-0.055, 0.055);
    const lngOffset = randomFloat(-0.055, 0.055);
    const lat = Number((cLat + latOffset).toFixed(5));
    const lng = Number((cLng + lngOffset).toFixed(5));

    // Status: 2 deployed, 1 in maintenance, rest available
    let status = "available";
    let assignedIncidentId = null;
    let assignedIncidentLocation = null;
    let missionPhase = "standby";

    if (b === 2) {
      status = "deployed";
      assignedIncidentId = incidents[0]?.id;
      assignedIncidentLocation = incidents[0]?.location_name;
      missionPhase = "en_route";
    } else if (b === 3) {
      status = "deployed";
      assignedIncidentId = incidents[1]?.id;
      assignedIncidentLocation = incidents[1]?.location_name;
      missionPhase = "on_scene";
    } else if (b === targetBoatCount) {
      status = "maintenance";
      missionPhase = "servicing";
    }

    boats.push({
      id: `BOAT-${district.id.toUpperCase()}-${String(b).padStart(2, "0")}`,
      district_id: district.id,
      district_name: district.shortName,
      name: `${boatDef.name} (${district.shortName})`,
      agency: boatDef.agency,
      type: boatDef.type,
      capacity: boatDef.cap,
      commander: commanderName,
      crew_count: randomInt(2, 4),
      contact: `VHF Ch 1${(b % 6) + 1} / +91-9447${randomInt(10, 99)}-${randomInt(1000, 9999)}`,
      base_name: `${baseName}, ${district.shortName}`,
      latitude: lat,
      longitude: lng,
      status: status,
      assigned_incident_id: assignedIncidentId,
      assigned_incident_location: assignedIncidentLocation,
      mission_phase: missionPhase,
      mission_started_at: status === "deployed" ? new Date(Date.now() - 10 * 60000).toISOString() : null,
      fuel_percent: randomInt(70, 98),
      rescues_completed: randomInt(2, 14),
      equipment: [
        "Lifejackets (x14)", "Trauma First Aid Kit", "Emergency Float Lines",
        b % 2 === 0 ? "Paramedic Onboard" : "Night Searchlights",
        b % 3 === 0 ? "Heavy Tow Winch" : "Dewatering Pumps"
      ]
    });
  }

  // 3. Evacuation Shelters / Relief Camps (allocated nearest to district flood areas)
  const shelters = (meta.shelters || []).map((s, idx) => ({
    id: `SHELTER-${district.id.toUpperCase()}-${idx + 1}`,
    district_id: district.id,
    district_name: district.shortName,
    name: s.name,
    capacity: s.capacity,
    occupied: s.occupied,
    available_space: s.capacity - s.occupied,
    latitude: s.lat,
    longitude: s.lng,
    facilities: ["Medical Post", "RO Drinking Water", "Community Kitchen", "Backup Generator", "Sanitation Kits"],
    camp_officer: `Revenue Inspector ${COMMANDERS[idx % COMMANDERS.length].split(" ").pop()}`
  }));

  // 4. District Flood Risk Zones
  const riskZones = [
    {
      id: `RISK-${district.id.toUpperCase()}-PRIMARY`,
      district_id: district.id,
      name: `${district.shortName} River Inundation Core Basin`,
      latitude: Number((cLat + 0.005).toFixed(4)),
      longitude: Number((cLng + 0.005).toFixed(4)),
      radius_m: 2200,
      risk_score: 0.94,
      risk_level: "HIGH",
      source: "Kerala State Disaster Management Authority (KSDMA)"
    },
    {
      id: `RISK-${district.id.toUpperCase()}-SECONDARY`,
      district_id: district.id,
      name: `${district.shortName} Lowland Spillway & Tributary Surge`,
      latitude: Number((cLat - 0.015).toFixed(4)),
      longitude: Number((cLng - 0.012).toFixed(4)),
      radius_m: 1600,
      risk_score: 0.78,
      risk_level: "HIGH",
      source: "Central Water Commission & Irrigation Dept"
    }
  ];

  return {
    district,
    incidents,
    boats,
    shelters,
    riskZones
  };
}

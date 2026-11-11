export interface SourceDoc {
  title: string;
  location: string;
  url: string;
}

export interface TransitFactor {
  kgPerPkm: number;
  label: string;
  basis: string;
  source: string;
}

export interface VehicleFactor {
  id: string;
  label: string;
  kgPerKm: number;
  kmPerL: number;
}

export const FACTORS = {
  version: 1,

  transit: {
    bus: {
      kgPerPkm: 0.02948,
      label: "Bus",
      basis: "Delhi DTC and cluster buses, CNG, 2019-20, includes actual passenger loads",
      source: "teri",
    },
    metro: {
      kgPerPkm: 0.02929,
      label: "Metro / light rail",
      basis: "Delhi Metro, traction electricity incl. renewables, 2019-20 (TERI gives 0.02073 to 0.02929; higher value used)",
      source: "teri",
    },
    train: {
      kgPerPkm: 0.007976,
      label: "Suburban train",
      basis: "Indian Railways suburban passenger services, electric and diesel, 2014-15",
      source: "ighgp-rail",
    },
  } as Record<string, TransitFactor>,

  vehicles: [
    { id: "hatch1000", label: "Petrol hatchback, up to 1000 cc", kgPerKm: 0.127, kmPerL: 16.42 },
    { id: "hatch1400", label: "Petrol hatchback, up to 1400 cc", kgPerKm: 0.140, kmPerL: 16.42 },
    { id: "sedan1400", label: "Petrol sedan, up to 1400 cc", kgPerKm: 0.153, kmPerL: 14.9 },
    { id: "suv1600", label: "Petrol compact SUV, up to 1600 cc", kgPerKm: 0.166, kmPerL: 11.6 },
  ] as VehicleFactor[],

  vehicleBasis:
    "India GHG Program, Road Transport Technical Paper, passenger car table with the 8% real-world uplift; average petrol fuel efficiency by body type from the same paper. Emissions are per vehicle-km and are divided by the number of occupants.",
  vehicleSource: "ighgp-road",

  fuel: {
    petrolPricePerL: 111.21,
    petrolPriceNote: "Mumbai, retrieved 1 November 2026 from Business Today. Petrol prices vary by city and change often.",
    petrolSource: "businesstoday",
  },

  sources: {
    teri: {
      title: "The Energy and Resources Institute (TERI), Estimating Carbon Footprint of Public Transport in Delhi",
      location: "TERI Report No. 2020UD02, Table 4.2 (CNG buses) and Table 4.6 (Delhi Metro)",
      url: "https://www.teriin.org/",
    },
    "ighgp-rail": {
      title: "India GHG Program, Technical Paper: Railway Transport Sector",
      location: "Table 7: Specific emission factors for passenger traction by service category",
      url: "https://indiaghgp.org/",
    },
    "ighgp-road": {
      title: "India GHG Program, Technical Paper: Road Transport Sector",
      location: "Table 3: Fuel consumption and emission factors for 4-wheeler passenger vehicles",
      url: "https://indiaghgp.org/",
    },
    businesstoday: {
      title: "Business Today, Petrol Price in Greater Mumbai",
      location: "Fuel price tracker",
      url: "https://www.businesstoday.in/fuel-price/petrol-price-in-greater-mumbai-today",
    },
  } as Record<string, SourceDoc>,

  assumptions: {
    occupancy: 1, // solo driving default
    congestion: 1.0, // multiplier on driving time
    walkKmh: 4.8,
    cycleKmh: 15.0,
    walkMaxKm: 6.0,
    cycleMaxKm: 25.0,
    accessKm: {
      bus: 1.5,
      metro: 2.5,
      train: 3.5,
    } as Record<string, number>,
  },
};


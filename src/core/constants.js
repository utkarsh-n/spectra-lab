// Physical constants, SI. Exact values are the 2019 SI defining constants;
// the rest are CODATA 2018 recommended values.
export const C = 299792458; // speed of light in vacuum, m/s (exact)
export const H = 6.62607015e-34; // Planck constant, J s (exact)
export const HBAR = H / (2 * Math.PI);
export const E_CHARGE = 1.602176634e-19; // elementary charge, C (exact)
export const KB = 1.380649e-23; // Boltzmann constant, J/K (exact)
export const NA = 6.02214076e23; // Avogadro constant, 1/mol (exact)
export const EPS0 = 8.8541878128e-12; // vacuum permittivity, F/m
export const MU0 = 1.25663706212e-6; // vacuum permeability, N/A^2
export const ME = 9.1093837015e-31; // electron mass, kg
export const ME_EV = 510998.95; // electron rest energy, eV
export const ME_OVER_MP = 1 / 1836.15267343;
export const RYDBERG_INF = 10973731.56816; // 1/m
export const R_HYDROGEN = RYDBERG_INF / (1 + ME_OVER_MP); // reduced-mass Rydberg for hydrogen-1
export const WIEN_B = 2.897771955e-3; // Wien displacement constant, m K
export const GAMMA_PROTON_HZ_PER_T = 42.577478518e6; // proton gyromagnetic ratio / 2π

export const HC_EV_M = (H * C) / E_CHARGE; // 1.239841984e-6 eV m
export const EV_TO_KCAL_PER_MOL = (E_CHARGE * NA) / 4184; // thermochemical calorie
export const EV_TO_KJ_PER_MOL = (E_CHARGE * NA) / 1000;
export const PAIR_THRESHOLD_EV = 2 * ME_EV;
export const IONIZING_EV = 10; // conventional threshold for ionizing radiation (~124 nm)
export const VISIBLE_EDGE_EV = HC_EV_M / 400e-9; // photon energy at the violet edge, 3.10 eV

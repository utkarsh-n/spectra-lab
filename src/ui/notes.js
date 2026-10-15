// Field notes: what is real, what is illustrative, and where the numbers come from.
const INSTRUMENT_NOTES = {
  scope: `<p>The blue trace is the electric field E and the red trace is the magnetic field B. They rise and fall together, always at right angles to each other and to the direction of travel; the amber arrow is the energy flow S = E × B / μ₀. With δ ≠ 0 the E vector turns as the wave advances and the trace becomes a helix.</p>
<p>With a medium selected, the right half of the scope is filled with it. The wave slows to c/n there and its wavelength shrinks by the same factor, while the frequency stays the same. If the medium absorbs at this wavelength (water at microwave frequencies, for example), the wave also fades as it goes. The amplitude that enters is the Fresnel transmission 2/(1 + n); the reflected wave is not drawn.</p>`,
  tuner: `<p>The ruler covers sixteen decades on a logarithmic scale. A cursor's height gives the wavelength, and frequency and photon energy are read off the same line, since c = fλ and E = hf. Band edges are conventions; the gamma/X-ray split at 10 pm follows the poster, though physically the two are named by where they come from (the nucleus or the electrons). The dashed line at 10 eV (124 nm) is the conventional start of ionizing radiation.</p>`,
  bench: `<p>Every specimen gets the same beam. <span class="badge table">table</span> means the number is interpolated from measured data. <span class="badge model">model</span> means it comes from oscillator or free-electron physics, or from a smooth curve through published anchor values, so trust its shape more than its third digit.</p>
<ul><li><b>Charge on a spring</b>: the Lorentz oscillator. Below its resonance it moves in step with the field, which slows light and gives the refractive index. On resonance it lags a quarter cycle and absorbs. Far above, it barely moves.</li>
<li><b>Water</b>: Segelstein's measured absorption from 10 nm to 10 m, and NIST attenuation for X-rays. Heating is α·I divided by water's heat capacity, at the surface.</li>
<li><b>Glass</b>: NIST Pyrex for X-rays. Optical absorption follows typical 3 mm borosilicate curves, with reflection from the BK7 Sellmeier equation.</li>
<li><b>Zinc</b>: a free-electron (Drude) metal whose plasma frequency comes from its electron density and whose damping comes from its DC conductivity. The photoelectric threshold is the 4.33 eV work function; X-rays use NIST data.</li>
<li><b>DNA</b>: two absorption bands fitted so that 50 µg/mL gives A260 = 1.0, A260/A280 ≈ 1.9 and A260/A230 ≈ 2.2, the standard lab values.</li>
<li><b>Finger</b>: NIST soft tissue and cortical bone (ICRU-44) for X-rays and gamma rays. Elsewhere, tissue optics after Jacques (2013) and muscle permittivity after Gabriel (1996), both modeled.</li></ul>`,
  decompose: `<p><b>Polarization</b>: any field can be split into Ex and Ey. The angle θ sets how the amplitude divides between them and δ sets how far Ey lags. The tip of E traces a line (δ = 0), a circle (θ = 45°, δ = ±90°) or an ellipse; this is the same Lissajous math as Orbitals. An ideal polarizer passes cos²ψ·cos²α + sin²ψ·sin²α + ½·sin2ψ·sin2α·cosδ of the intensity.</p>
<p><b>Probe charge</b>: the exact motion of a free electron that starts at rest in the wave. The strength parameter a₀ = eE₀/(mωc) sets the size of the effect. E shakes the electron sideways; v×B then pushes it forward at twice the frequency, so it traces a figure eight while drifting at a₀²/(4 + a₀²) of c. Drop B and it only shakes. Drop E and nothing happens, because B can't push a charge that isn't moving.</p>
<p><b>Fourier</b>: the sum of every source's frequency components. A pulse needs a spread of frequencies; a thermal source is many components with random phases, weighted by Planck's law.</p>`,
  lab: `<p>Sweeping moves the cursor across the sample's range and tunes the active source to match. Hydrogen line positions come exactly from the Rydberg formula with the reduced-mass correction (within 0.01 nm of NIST). CO₂ band centres are literature values; their rotational envelopes are modeled. The liquid-water infrared spectrum is measured (Segelstein). Chlorophyll peak positions follow Lichtenthaler (1987) in ether, with modeled shapes. The NMR spectrum uses the CODATA proton gyromagnetic ratio, textbook ethanol shifts and J = 7.1 Hz.</p>`,
};

export function renderNotes(el, app) {
  el.innerHTML = `
  <div class="notes-head"><h2 id="notes-title">Field notes</h2><button class="glass round" id="notes-close" aria-label="Close field notes"><svg class="icon"><use href="#i-close"/></svg></button></div>
  <h3>This instrument</h3>${INSTRUMENT_NOTES[app.state.instrument]}
  <h3>What's real and what's illustrative</h3>
  <p>Readouts are real SI values: wavelength, frequency, photon energy, B₀ = nE₀/c, intensity ½nε₀cE₀², photon flux, and how much passes or is absorbed. Three things are display choices: time runs slower by the factor shown at the bottom (often 10¹⁴ or more), the camera zooms so about three wavelengths fill the scope, and field amplitudes are scaled to fit the screen.</p>
  <h3>Dials</h3>
  <ul><li><b>λ</b> wavelength in vacuum, log scale from 0.1 pm to 1 km. Its color follows the wave.</li><li><b>E₀</b> peak electric field. More field means more photons, not more energetic ones.</li><li><b>θ</b> the split between Ex and Ey (the tilt, for linear light). <b>δ</b> the lag of Ey behind Ex. <b>φ</b> the overall phase.</li><li><b>T</b> temperature of a thermal source, and <b>N</b> the length of a pulse in cycles.</li><li><b>Link</b> applies the same relative change to every source, so a chord keeps its shape.</li></ul>
  <h3>References</h3>
  <ul>
  <li>CODATA 2018 and SI 2019 constants (NIST).</li>
  <li><a href="https://physics.nist.gov/PhysRefData/XrayMassCoef/" target="_blank" rel="noopener">NIST X-Ray Mass Attenuation Coefficients</a>, Hubbell &amp; Seltzer (water, ICRU-44 tissue and bone, Pyrex, zinc, lead).</li>
  <li><a href="https://omlc.org/spectra/water/" target="_blank" rel="noopener">Segelstein (1981)</a>, the complex refractive index of water, 10 nm–10 m, via OMLC.</li>
  <li>Schott N-BK7 data sheet; Malitson (1965) fused silica; Kaatze (1989) water dielectric relaxation.</li>
  <li><a href="https://physics.nist.gov/asd" target="_blank" rel="noopener">NIST Atomic Spectra Database</a> (hydrogen); CRC Handbook work functions.</li>
  <li><a href="https://openstax.org/books/university-physics-volume-2/pages/16-introduction" target="_blank" rel="noopener">OpenStax University Physics 2, ch. 16</a>, electromagnetic waves.</li>
  </ul>`;
  el.querySelector("#notes-close").addEventListener("click", () => el.closest("dialog").close());
}

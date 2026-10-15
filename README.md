# Spectra · web prototype

The web prototype of **Spectra**, an electromagnetic-spectrum instrument: tune one light wave from radio to gamma, split it into its parts, and watch matter respond. It plays the same role phosphor-geometry-lab played for Orbitals. The physics core here is what the native SwiftUI + Metal app will port and run parity tests against.

```sh
npm start       # http://localhost:3002/  (loopback only, live reload)
npm test        # physics regression suite, no network needed
npm run data    # regenerate src/data/*.js from data/raw/
npm run build   # static copy in dist/
```

No installation is needed. The prototype has zero dependencies: ES modules, Canvas 2D, Node built-ins for the server and `node:test` for the tests.

## Instruments

| | Instrument | What it shows |
| --- | --- | --- |
| 01 | Wave scope | E (blue) and B (red) in 3D with field arrows and the Poynting vector S. Up to three sources are superposed; δ ≠ 0 turns E into a helix. With a medium selected, the far half slows the wave to c/n, shortens λ, and fades it where the medium absorbs. |
| 02 | Spectrum tuner | A 16-decade log ruler (0.1 pm to 1 km) with λ, f and E axes, size comparisons, and the ionizing (10 eV) and pair-production (1.022 MeV) lines. Drag a cursor to tune; band edges are detents. Thermal sources draw their Planck curve, and pulses show their bandwidth. |
| 03 | Matter bench | A charge on a spring, an FM dipole antenna, water, glass, zinc, DNA and a finger, all in the same beam. Each shows transmitted, reflected and absorbed fractions with a **table** or **model** badge. Side-by-side or in-series (Beer–Lambert) modes, and resonance detents. |
| 04 | Decompose | **Polarization** looking down the beam, with an Ex/Ey split and a polarizer. **Probe charge**: the exact trajectory of a free electron, with E + v×B, E only or B only. **Fourier**: the time trace of the summed field next to its frequency stems, plus a prism inset when a medium is set. |
| 05 | Spectroscopy lab | Hydrogen emission and absorption, CO₂ IR and Raman, liquid water IR, chlorophyll a and b, and ethanol ¹H NMR at 400 or 60 MHz. Sweeping retunes the active source. |

There are 14 field trips (presets), each with real numbers: FM radio, microwave oven, Wi-Fi, thermal camera, prism, photoelectric effect, hydrogen lines, sunburn, hand X-ray, cosmic background, NMR, circular light, a petawatt laser and a greenhouse gas.

Dials follow the Orbitals scheme: each has a fixed accent and Greek symbol. **λ** (its color follows the wave), **E₀** blue, **θ** mint, **δ** rose, **φ** violet, plus **T** for thermal sources and **N** for pulses. **Link** applies the same *relative* change to every source, so a chord keeps its shape.

## Sound and haptics

Both are options under Field controls → Feedback. With sound on, each source hums at a pitch mapped from its real frequency (log scale; 15 decades map to four octaves). Band edges click, the ionizing line thumps, and crossing a resonance rings. Haptics use `navigator.vibrate` (Android browsers) or, on iOS Safari 18+, the system tick from a hidden `<input switch>`. Pulses are rate-limited and scaled by the strength slider. The native app replaces both with Core Haptics.

## Physics and provenance

Every number in the interface is either measured reference data (**table**) or comes from physics or a fitted curve (**model**), and each result says which. Readouts are real SI values. Display time is slowed (the transport shows the factor, typically 10⁸–10²⁰), the camera fits about three wavelengths on screen, and amplitudes are normalized for drawing.

| Module | Contents | Source |
| --- | --- | --- |
| `core/constants.js` | SI 2019 exact constants, CODATA 2018 values | NIST |
| `core/spectrum.js` | λ ↔ f ↔ E, bands, detents, spectral colour, formatting | — |
| `core/wave.js` | Jones fields, polarization ellipse, polarizer, intensity, Planck/Wien, pulses, exact electron trajectory (light-front solution) | Born & Wolf; textbook |
| `core/matter.js` | Log-log table interpolation with absorption edges, Lorentz/Drude/Debye permittivity, Sellmeier media, free-electron zinc, slab transmission | Schott N-BK7; Malitson 1965; Kaatze 1989; CRC work functions |
| `core/specimens.js` | The seven bench specimens | NIST XCOM tables; Segelstein 1981; model anchors (Jacques 2013, Gabriel 1996) |
| `core/samples.js` | Lab spectra | Rydberg formula (reduced mass); CO₂ band centres; Lichtenthaler 1987; CODATA proton γ |
| `data/raw/` | NIST X-ray mass attenuation (water, ICRU-44 soft tissue and cortical bone, Pyrex, zinc, lead) and Segelstein's water absorption, 10 nm–10 m | retrieved 2026-10-03 |

## Layout

```
data/raw/            reference tables exactly as retrieved
src/data/            generated ES modules (npm run data)
src/core/            pure physics, no DOM; this is what Swift will port
src/ui/              app shell, controls, dials, feedback, field notes, canvas helpers
src/instruments/     one module per instrument: mount / update / draw / pointer
public/              index.html, spectra.css (OrbitTheme palette), favicon
tests/               node:test suite and independent reference fixtures
```

Only the selected instrument renders. Rendering stops when the tab is hidden, and readouts refresh at 10 Hz. Settings persist in `localStorage`.

## Next: native

Phase 2 ports `src/core` to Swift and checks parity against this JavaScript, as Orbitals did. Phase 3 adds the native feel (Core Haptics, full-screen Metal canvases) and the AR true-scale view. AR is native only.


## Public snapshot

See [PUBLICATION.md](PUBLICATION.md) for publication exclusions and setup requirements.

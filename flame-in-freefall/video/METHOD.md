# From video to data: flame spread in BASS-II

NASA's BASS-II experiment (PSI-25) burned 129 samples on the space station. The PSI table lists
the conditions of each test but not what the flame did. The results sit in 275 GB of raw video and
photographs. This folder shows that the main result, the flame spread rate, can be measured from
those videos automatically, and checks the measurement against what NASA reported.

## What was measured

Seven tests from one operations day (GMT 50, 19 February 2014): thin PMMA films 100 to 400 µm
thick, 2 cm wide, at 22.2 % oxygen, in an opposed airflow of about 5 or 2 cm/s.

| Test | Film | Air | Spread rate | Fit R² | Confidence |
|---|---|---|---|---|---|
| B1 | 100 µm | 5 cm/s | 2.20 mm/s (calibration point) | 0.9996 | high |
| B2 | 200 µm | 5 cm/s | 1.26 mm/s | 0.998 | high |
| B5 | 200 µm | 5 cm/s | 1.28 mm/s | 0.999 | high |
| B4 | 300 µm | 5 cm/s | 0.89 mm/s | 0.997 | high |
| B3, B12, B7 | 100–400 µm | 2 cm/s | not reported | – | low |

At 2 cm/s the flames turned dim and blue, close to extinction, as the NASA report describes. They
are too faint in the side-view video to track reliably, so no rate is given for them.

## How

1. The side-view video (720×480, 29.97 frames/s) is decoded with ffmpeg at 10 frames/s.
2. The flame is every pixel whose brightest colour channel exceeds the pre-ignition frame by more
   than 35 levels, below the text overlay.
3. The leading edge is the right end of the flame (the flame spreads right, into the flow).
4. The spread rate is a straight-line fit of the leading-edge position from 8 s after ignition
   (after the igniter glow) to the moment the fan reading on the overlay changes, which the script
   detects itself. The same fit is repeated with thresholds of 20 and 60; the rates change by less
   than 2 %.

This follows the method of the NASA/SDSU analysis described in the report (leading edge found with
a fixed intensity threshold, rate from a linear regression of consecutive positions), applied to the
video instead of the still photographs.

## Scale

The video has no ruler in view. One scale (0.223 mm per pixel) is set so that test B1 matches the
2.2 mm/s that the BASS-II Summary Report (NASA/TM-20210011385, section 2.1.2.1) gives for "the first
test", a 100 µm film. B1 is that test: it is the first 100 µm test of the campaign, and its video
shows the fan turned down mid-sample and the flame going out within 2 s, as the report describes.
The camera did not move during the day: ignition happens at the same image position (199 to 215 px)
in every test.

## Checks the calibration does not use

| Check | Expected | Measured | Result |
|---|---|---|---|
| Repeat: B2 and B5 are identical tests | same rate | 1.26 and 1.28 mm/s, 1.6 % apart | pass |
| Flame out after the flow is cut (B1) | within 2 s (report) | 1.9 s | pass |
| Thin-fuel law: rate ∝ 1 / thickness (report) | exponent −1 | −0.82, R² 0.998 | pass, with a slower fall-off than ideal |
| Image width × scale vs 17 cm test section | about 170 mm | 160 mm | pass (6 % short) |
| B1 travel before the cut vs "half the sample length" | about 48 mm | 53 mm | pass (11 % long) |

## Limits

- One calibration point. If the report's 2.2 mm/s were off, every rate here shifts by the same factor.
  The ratios between tests do not depend on it.
- Seven tests from one day. Other days used other framings (for example test B22 on GMT 216), which
  would need their own scale.
- Dim flames near extinction are not measured.
- This is a demonstration of the method, not a replacement for the PIs' analysis.

## Run it

```
python3 video/run_all.py PATH_TO_VIDEOS   # writes data/derived/video_results.json and thumbnails
python3 video/extract.py VIDEO.mp4        # one video, prints the track summary
```

Videos: https://psi.nasa.gov/physci/repo/data/investigations/PSI-25 (Raw Data,
`BASS_GMT50_SAMPLE_*_TEST_B*.mp4`, 6 to 17 MB each). Needs ffmpeg and numpy.

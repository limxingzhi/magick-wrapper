# magick-wrapper

A stateless Node.js HTTP service that overlays captions onto images using ImageMagick. Designed to be called from n8n workflows to generate captioned phone wallpapers.

## Prerequisites

- [Podman](https://podman.io/) (or Docker)

## Build & Run

```bash
podman build -t magick-wrapper .
podman run -p 3000:3000 magick-wrapper
```

Server starts on `http://localhost:3000`.

## Usage

### Endpoint

```
GET /caption?url=<encoded-image-url>&text=<encoded-caption>
```

### Parameters

| Param       | Required | Default   | Description                                                  |
|-------------|----------|-----------|--------------------------------------------------------------|
| `url`       | yes      |           | Publicly accessible image URL (S3, etc.)                     |
| `text`      | yes      |           | Caption text to overlay                                      |
| `fontSize`  | no       | `64`      | Max font size in points — auto-scaled down if text overflows |
| `maxWidthPct`| no      | `0.85`    | Max text width as fraction of image width (0-1)              |
| `color`     | no       | `white`   | Text color                                                   |
| `font`      | no       | `Helvetica`| Font name (resolved via `fc-match`)                          |
| `fontWeight`| no       | `Bold`    | Font weight: `Thin`, `Light`, `Normal`, `Medium`, `Bold`, `Heavy`, or 100–900 |
| `lineHeight`| no       | `1.3`     | Line height multiplier (1.0 = tight, 1.5 = spacious, 2.0 = double-spaced) |
| `gravity`   | no       | `center`  | Placement: `center`, `south`, `north`, etc.                  |
| `x`         | no       | `0`       | Horizontal offset from gravity point (px)                    |
| `y`         | no       | `50`      | Vertical offset downward from gravity point (px)             |
| `quality`   | no       | `90`      | JPEG output quality (1-100)                                  |

Text is auto-scaled to fit within `maxWidthPct` of the image width, so it never overflows. The `fontSize` param acts as a maximum — it will be reduced if needed to fit.

### Example

```
curl -o wallpaper.jpg "http://localhost:3000/caption?url=https://example.com/photo.jpg&text=Hello%20World"
```

### n8n Integration

Add an **HTTP Request** node to your workflow:

- **Method:** `GET`
- **URL:** `http://your-server:3000/caption?url={{ encodeURIComponent($json.imageUrl) }}&text={{ encodeURIComponent($json.caption) }}`
- **Response Format:** File (Binary)

Pipe the output to your next step — save it, send it to your phone, etc.

## Health Check

```
GET /health → {"status":"ok"}
```

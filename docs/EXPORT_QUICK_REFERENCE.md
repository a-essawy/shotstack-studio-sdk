# Export Process - Quick Reference

This is a quick reference guide for understanding the export process in Shotstack Studio SDK. For detailed information, see [EXPORT_PROCESS.md](EXPORT_PROCESS.md).

## Quick Start

```typescript
import { Edit, Canvas, VideoExporter } from "@shotstack/shotstack-studio";

// 1. Create and load your edit
const edit = new Edit({ width: 1280, height: 720 }, "#000000");
await edit.load();

// 2. Create canvas
const canvas = new Canvas(edit.size, edit);
await canvas.load();

// 3. Export
const exporter = new VideoExporter(edit, canvas);
await exporter.export("my-video.mp4", 30);
```

## Key Components

| Component | Purpose | Location |
|-----------|---------|----------|
| **ExportCoordinator** | Main orchestrator | `src/core/export/export-coordinator.ts` |
| **VideoFrameProcessor** | Frame extraction & caching | `src/core/export/video-frame-processor.ts` |
| **AudioProcessor** | Audio encoding & mixing | `src/core/export/audio-processor.ts` |
| **ExportProgressUI** | Progress display | `src/core/export/export-progress-ui.ts` |
| **ExportCommand** | State capture | `src/core/commands/export-command.ts` |

## Export Phases

| Phase | Progress | Description |
|-------|----------|-------------|
| **1. Initialization** | 0% | Browser check, save state, create UI |
| **2. Configuration** | 0% | Calculate FPS, frames, dimensions |
| **3. Video Prep** | 10% | Initialize processor, setup caching |
| **4. Output Setup** | 15% | Create MP4 output, add video track |
| **5. Audio** | 15-20% | Fetch, decode, encode audio |
| **6. Frame Rendering** | 25-100% | Process each frame (main work) |
| **7. Finalization** | 100% | Complete encoding, trigger download |

## Critical Technologies

- **WebCodecs API** - Required for video encoding (Chrome 94+, Edge 94+)
- **mediabunny** - MP4 muxing and encoding
- **Web Audio API** - Audio decoding
- **PixiJS** - Scene rendering and pixel extraction

## Common Parameters

```typescript
await exporter.export(filename, fps);
```

- `filename` (optional): Default is `"shotstack-export.mp4"`
- `fps` (optional): Default is `30` or from `edit.output.fps`

## Quality Settings (Fixed)

- **Video**: H.264 @ 5 Mbps
- **Audio**: AAC @ 128 kbps
- **Resolution**: From `edit.output.size`

## Browser Support Check

```typescript
if (typeof VideoEncoder === "undefined") {
  alert("Export requires Chrome 94+ or Edge 94+");
}
```

## Error Handling

```typescript
try {
  await exporter.export("video.mp4", 30);
} catch (error) {
  if (error instanceof BrowserCompatibilityError) {
    // Handle unsupported browser
  } else if (error instanceof ExportError) {
    // Handle export-specific error
    console.log(`Failed in ${error.phase} phase`);
  }
}
```

## Performance Tips

1. **Caching**: System auto-caches 10 frames + 5 textures (LRU)
2. **FPS**: Lower FPS = faster export but less smooth
3. **Duration**: Export time ≈ 20-100% of video duration
4. **Memory**: Higher resolution uses more memory

## Keyboard Shortcut

- **Cmd/Ctrl + E**: Trigger export with defaults

## Typical Export Timeline

For a 10-second video at 30 FPS:

```
Total frames: 300
Expected time: 5-20 seconds (depending on complexity)

Progress breakdown:
- 0-10%:   ~1 second   (setup)
- 10-20%:  ~1 second   (audio)
- 20-100%: ~3-18 seconds (frame rendering)
```

## Frame Processing Loop

For each frame:
1. Update playback time → 2. Update clips → 3. Process videos → 4. Render → 5. Extract pixels → 6. Encode

## Caching Strategy

```
Frame Cache (10 items)
├─ Key: `${videoSrc}-${timestamp}`
└─ Value: ImageData

Texture Cache (5 items)
├─ Key: `${videoSrc}-${timestamp}`
└─ Value: PixiJS Texture
```

## Common Issues

| Problem | Solution |
|---------|----------|
| "Export in progress" | Wait for current export to finish |
| "WebCodecs not supported" | Use Chrome 94+ or Edge 94+ |
| Export hangs | Check video clips can seek properly |
| No audio | Check CORS, file format, console errors |
| Poor quality | Check source quality, consider bitrate |

## Export Output

- **Format**: MP4 (H.264 + AAC)
- **Container**: MPEG-4 Part 14
- **Download**: Automatic via browser
- **Location**: Browser's default download folder

## State Management

The exporter:
- ✅ Saves current state (playback, position, zoom)
- ✅ Pauses playback during export
- ✅ Restores state after completion
- ✅ Handles errors gracefully
- ✅ Cleans up resources

## API Surface

```typescript
class VideoExporter {
  constructor(edit: Edit, canvas: Canvas)
  
  async export(
    filename?: string,  // default: "shotstack-export.mp4"
    fps?: number        // default: 30 or edit.output.fps
  ): Promise<void>
  
  dispose(): void
}
```

## Related Documentation

- **[EXPORT_PROCESS.md](EXPORT_PROCESS.md)** - Full documentation with code examples
- **[EXPORT_FLOW_DIAGRAM.md](EXPORT_FLOW_DIAGRAM.md)** - Visual flow diagrams
- **[readme.md](../readme.md)** - Main SDK documentation

## Architecture Summary

```
VideoExporter (coordinator)
  ├─ ExportCommand (state capture)
  ├─ VideoFrameProcessor (video handling)
  ├─ AudioProcessor (audio handling)
  ├─ ExportProgressUI (user feedback)
  └─ mediabunny Output (encoding & muxing)
```

## Code Examples

### Basic Usage
```typescript
const exporter = new VideoExporter(edit, canvas);
await exporter.export();
```

### Custom Settings
```typescript
await exporter.export("high-quality.mp4", 60);
```

### With Error Handling
```typescript
try {
  await exporter.export("video.mp4", 30);
  console.log("Export successful!");
} catch (error) {
  console.error("Export failed:", error);
}
```

### Check Browser Support
```typescript
if (typeof VideoEncoder !== "undefined") {
  const exporter = new VideoExporter(edit, canvas);
  await exporter.export();
} else {
  alert("Export not supported in this browser");
}
```

## Cleanup

```typescript
// When done with exporter
exporter.dispose();
```

This removes keyboard event listeners and cleans up internal state.

---

**Need more details?** See the full [Export Process Documentation](EXPORT_PROCESS.md).

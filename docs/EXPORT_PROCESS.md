# Export Process Documentation

## Overview

The export process in Shotstack Studio SDK converts a video editing project (Edit) into an MP4 video file that can be downloaded in the browser. This document explains how the export system works, its architecture, and the flow of data through the various components.

## Architecture

The export system is located in `src/core/export/` and consists of several specialized components:

### Core Components

1. **ExportCoordinator** (`export-coordinator.ts`)
   - Main orchestrator of the export process
   - Exported as `VideoExporter` for backward compatibility
   - Coordinates video frame processing, audio processing, and progress UI
   - Manages the lifecycle of the export operation

2. **VideoFrameProcessor** (`video-frame-processor.ts`)
   - Handles video frame extraction and processing
   - Manages frame caching for performance
   - Replaces video textures with static frames during export
   - Handles seeking to specific timestamps in video clips

3. **AudioProcessor** (`audio-processor.ts`)
   - Processes audio tracks from the timeline
   - Extracts and encodes audio data
   - Handles audio mixing and volume control
   - Converts audio to AAC format for MP4

4. **ExportProgressUI** (`export-progress-ui.ts`)
   - Displays a modal overlay showing export progress
   - Shows percentage complete and current status
   - Provides visual feedback during the export process

5. **ExportCommand** (`commands/export-command.ts`)
   - Command object that captures the current state of all clips and tracks
   - Executed as part of the Edit command system
   - Provides read-only access to clips and tracks during export

## Export Workflow

### Phase 1: Initialization and Validation

```typescript
const exporter = new VideoExporter(edit, canvas);
await exporter.export("my-video.mp4", 25); // filename, fps
```

1. **Browser Compatibility Check**
   - Verifies that `VideoEncoder` (WebCodecs API) is available
   - Throws `BrowserCompatibilityError` if not supported
   - Currently requires Chrome/Edge 94+ or other WebCodecs-compatible browsers

2. **State Management**
   - Saves current edit state (playback position, zoom, visibility)
   - Pauses playback if playing
   - Sets export mode on the edit
   - Prevents concurrent exports

3. **Progress UI Creation**
   - Creates modal overlay with progress bar
   - Displays initial "Preparing..." status

### Phase 2: Configuration

```javascript
const cfg = this.prepareConfig(fps);
// Returns: { fps, size, frames, frameDuration }
```

- **FPS**: Frames per second (defaults to 30 or from edit.output.fps)
- **Size**: Output dimensions from edit configuration
- **Frames**: Total number of frames = ceil(duration_seconds * fps)
- **Frame Duration**: Time per frame in milliseconds = 1000 / fps

### Phase 3: Video Preparation (10% complete)

1. **Execute Export Command**
   ```javascript
   this.edit.executeEditCommand(this.exportCommand);
   ```
   - Captures current state of all clips and tracks
   - Creates immutable snapshot for export

2. **Initialize Video Processor**
   ```javascript
   await this.videoProcessor.initialize(this.exportCommand.getClips());
   ```
   - Identifies all video clips in the timeline
   - Creates extraction canvas (4K size for quality)
   - Maps video elements to their players
   - Sets up frame caching system (LRU cache with 10 frame capacity)

### Phase 4: Output Setup (15% complete)

```javascript
const output = new Output({ 
  format: new Mp4OutputFormat(), 
  target: new BufferTarget() 
});
```

1. **Create Canvas for Encoding**
   - Creates offscreen canvas matching output dimensions
   - Used to capture frames for video encoding

2. **Add Video Track**
   ```javascript
   const videoSource = new CanvasSource(canvas, { 
     codec: "avc",      // H.264 codec
     bitrate: 5_000_000 // 5 Mbps
   });
   output.addVideoTrack(videoSource);
   ```

### Phase 5: Audio Processing (15-20% complete)

1. **Setup Audio Tracks**
   ```javascript
   const audioSource = await this.audioProcessor.setupAudioTracks(tracks, output);
   ```
   - Scans all tracks for AudioPlayer instances
   - Fetches audio files from their source URLs
   - Stores audio data with timing and volume information

2. **Process Audio Samples** (if audio exists)
   ```javascript
   await this.audioProcessor.processAudioSamples(audioSource);
   ```
   - Decodes audio using Web Audio API
   - Applies volume adjustments
   - Converts to interleaved Float32 format
   - Encodes to AAC at 128kbps
   - Synchronizes audio with video timeline

### Phase 6: Frame-by-Frame Rendering (25-100% complete)

This is the most intensive phase, processing each frame sequentially:

```javascript
for (let i = 0; i < cfg.frames; i += 1) {
  const frameTime = i * cfg.frameDuration;
  
  // 1. Update playback time
  this.edit.playbackTime = frameTime;
  
  // 2. Update all clips for current time
  for (const clip of this.exportCommand.getClips()) {
    clip.update(0, 0);
  }
  
  // 3. Handle video clips specially
  for (const player of players) {
    if (frameTime >= start && frameTime < end) {
      await this.videoProcessor.replaceVideoTexture(player, frameTime);
    }
  }
  
  // 4. Render the frame
  this.edit.draw();
  this.app.renderer.render(this.app.stage);
  
  // 5. Extract pixels from the rendered scene
  const pixels = this.app.renderer.extract.pixels({
    target: container,
    frame: new pixi.Rectangle(0, 0, width, height)
  });
  
  // 6. Convert to ImageData and write to canvas
  const imageData = new ImageData(pixels.pixels, width, height);
  ctx.putImageData(imageData, 0, 0);
  
  // 7. Add frame to video encoder
  await videoSource.add(i / cfg.fps, 1 / cfg.fps);
  
  // 8. Update progress
  this.progressUI.update(percentage, 100, "Exporting...");
}
```

#### Video Frame Processing Details

For video clips, the system uses a sophisticated frame extraction process:

1. **Frame Extraction**
   - Seeks the video element to the exact timestamp
   - Waits for the 'seeked' event to ensure frame is loaded
   - Draws the video frame to an extraction canvas
   - Extracts ImageData from the canvas
   - Caches the frame data (LRU cache with 10 items)

2. **Texture Replacement**
   - Creates a static texture from the extracted frame
   - Replaces the live video texture with the static frame
   - Caches textures (LRU cache with 5 items)
   - Restores original textures after export

3. **Performance Optimizations**
   - LRU caching prevents memory overflow
   - Reuses textures for duplicate timestamps
   - Disables video playback updates during export
   - Uses 4K extraction canvas for high quality

### Phase 7: Finalization (100% complete)

1. **Finalize Output**
   ```javascript
   await output.finalize();
   ```
   - Completes video encoding
   - Writes MP4 container headers
   - Finalizes all media tracks

2. **Create Download**
   ```javascript
   const data = (output.target as BufferTarget).buffer;
   const blob = new Blob([data], { type: "video/mp4" });
   const url = URL.createObjectURL(blob);
   
   const a = document.createElement("a");
   a.href = url;
   a.download = filename;
   a.click();
   URL.revokeObjectURL(url);
   ```
   - Retrieves encoded video buffer
   - Creates Blob with MP4 MIME type
   - Generates temporary download URL
   - Triggers browser download
   - Cleans up the temporary URL

3. **Restore State**
   - Restores original video textures
   - Re-enables video playback updates
   - Restores zoom, position, and visibility
   - Restores playback position and state
   - Removes progress UI
   - Clears export mode

## Technical Details

### Dependencies

The export system relies on several key technologies:

1. **WebCodecs API** (`VideoEncoder`)
   - Browser API for video encoding
   - Required for export functionality
   - Supported in Chrome 94+, Edge 94+

2. **mediabunny** library
   - Provides `Output`, `Mp4OutputFormat`, `BufferTarget`
   - Handles MP4 container creation
   - Manages video/audio multiplexing
   - Provides `CanvasSource` for video encoding
   - Provides `AudioSampleSource` for audio encoding

3. **Web Audio API** (`AudioContext`)
   - Decodes audio files
   - Processes audio samples
   - Applies volume adjustments

4. **PixiJS** (`pixi.js`)
   - Renders the visual timeline
   - Extracts pixels from rendered scenes
   - Manages textures and sprites

### Error Handling

The export system includes specialized error types:

1. **ExportError**
   - Generic export error with phase information
   - Includes context object for debugging
   - Captures underlying cause

2. **BrowserCompatibilityError**
   - Thrown when WebCodecs is not available
   - Lists missing browser features
   - Helps users understand requirements

### Caching Strategy

The system uses LRU (Least Recently Used) caching to optimize performance:

1. **Frame Cache** (10 items)
   - Stores extracted ImageData from video frames
   - Key: `${videoSrc}-${timestamp}`
   - Reduces redundant video seeking

2. **Texture Cache** (5 items)
   - Stores PixiJS Texture objects
   - Key: `${videoSrc}-${timestamp}`
   - Reduces texture creation overhead

The `SimpleLRUCache` automatically evicts oldest entries when capacity is reached.

### Keyboard Shortcut

The export process can be triggered via keyboard:

- **Cmd/Ctrl + E**: Initiates export with default settings
- Disabled when in text input fields
- Prevented during active export

## Usage Examples

### Basic Export

```typescript
import { Edit, Canvas, VideoExporter } from "@shotstack/shotstack-studio";

const edit = new Edit({ width: 1280, height: 720 }, "#000000");
await edit.load();

const canvas = new Canvas(edit.size, edit);
await canvas.load();

// Export with default settings (30 fps)
const exporter = new VideoExporter(edit, canvas);
await exporter.export("my-video.mp4");
```

### Custom FPS

```typescript
// Export at 60 fps for smooth playback
await exporter.export("smooth-video.mp4", 60);

// Export at 24 fps for cinematic look
await exporter.export("cinematic.mp4", 24);
```

### Error Handling

```typescript
try {
  await exporter.export("video.mp4", 30);
} catch (error) {
  if (error instanceof BrowserCompatibilityError) {
    console.error("Browser not supported:", error.context.missingFeatures);
    alert("Please use Chrome 94+ or Edge 94+ to export videos");
  } else if (error instanceof ExportError) {
    console.error(`Export failed in ${error.phase} phase:`, error.message);
  } else {
    console.error("Unexpected error:", error);
  }
}
```

### With Progress Monitoring

The progress UI is automatically displayed, but you can also listen to the export state:

```typescript
const exporter = new VideoExporter(edit, canvas);

// The export process is handled internally
// Progress is shown via the built-in UI
await exporter.export("video.mp4", 30);
```

## Limitations and Considerations

### Browser Support

- **Required**: Chrome 94+, Edge 94+, or browsers with WebCodecs API
- **Not Supported**: Firefox (as of late 2024), Safari (partial support)
- Check compatibility: `typeof VideoEncoder !== "undefined"`

### Performance

- Export time scales linearly with video duration and FPS
- Higher FPS = longer export time
- Typical rate: 1-5 seconds of video per second of export time
- Memory usage scales with video resolution and cached frames

### Quality Settings

- **Video**: H.264 (AVC) at 5 Mbps bitrate
- **Audio**: AAC at 128 kbps bitrate
- **Resolution**: Matches edit output size
- Settings are currently fixed but can be customized in the code

### Known Limitations

1. Cannot export while another export is in progress
2. Browser tab must remain active during export
3. Large videos may cause memory pressure
4. Video clips must be accessible (no CORS issues)
5. Audio files must be fetched successfully

## Future Enhancements

Potential improvements to the export system:

1. **Configurable Quality Settings**
   - Allow custom bitrates
   - Support different codecs (VP9, AV1)
   - Quality presets (low, medium, high)

2. **Progress Callbacks**
   - Event-based progress reporting
   - Cancellation support
   - Pause/resume capability

3. **Worker-based Processing**
   - Offload encoding to Web Workers
   - Improve UI responsiveness
   - Parallel frame processing

4. **Streaming Export**
   - MediaStream Recording API fallback
   - Support for older browsers
   - Real-time preview during export

## Troubleshooting

### Export Fails Immediately

- **Check Browser Support**: Verify WebCodecs is available
- **Check Console**: Look for initialization errors
- **Check Assets**: Ensure all media files are accessible

### Export Hangs or Freezes

- **Check Video Clips**: Ensure videos can be seeked properly
- **Check Duration**: Very long videos may take significant time
- **Check Memory**: Browser may be running out of memory

### Poor Export Quality

- **Check Source Quality**: Export quality depends on source assets
- **Check Resolution**: Higher resolution requires more bitrate
- **Consider FPS**: Higher FPS improves smoothness but increases file size

### Audio Issues

- **Check Audio Format**: Ensure audio files are supported by browser
- **Check CORS**: Audio files must be accessible
- **Check Console**: Look for audio processing errors

## Related Files

- `src/core/export/export-coordinator.ts` - Main export orchestrator
- `src/core/export/video-frame-processor.ts` - Video frame handling
- `src/core/export/audio-processor.ts` - Audio processing
- `src/core/export/export-progress-ui.ts` - Progress UI
- `src/core/export/export-utils.ts` - Utilities and error types
- `src/core/commands/export-command.ts` - Export command
- `src/core/export/index.ts` - Export module exports

## Conclusion

The export system provides a comprehensive solution for converting video editing projects to downloadable MP4 files directly in the browser. It leverages modern web APIs (WebCodecs, Web Audio) and optimizes performance through caching and efficient frame processing. Understanding this workflow helps developers integrate export functionality and troubleshoot issues effectively.

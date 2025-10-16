# Export Process Flow Diagram

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    VideoExporter.export()                    │
│                   (ExportCoordinator)                        │
└───────────┬─────────────────────────────────────────────────┘
            │
            ├─► Phase 1: Initialization
            │   ├─ Check WebCodecs API support
            │   ├─ Prevent concurrent exports
            │   ├─ Save edit state (playback, zoom, position)
            │   ├─ Set export mode
            │   └─ Create progress UI overlay
            │
            ├─► Phase 2: Configuration
            │   ├─ Calculate FPS (default 30)
            │   ├─ Get output dimensions
            │   ├─ Calculate total frames
            │   └─ Calculate frame duration
            │
            ├─► Phase 3: Video Preparation (10%)
            │   ├─ Execute ExportCommand
            │   │  └─ Capture snapshot of clips & tracks
            │   └─ Initialize VideoFrameProcessor
            │      ├─ Identify video clips
            │      ├─ Map video elements
            │      ├─ Create 4K extraction canvas
            │      └─ Setup frame cache (LRU, 10 items)
            │
            ├─► Phase 4: Output Setup (15%)
            │   ├─ Create mediabunny Output
            │   │  ├─ Format: MP4
            │   │  └─ Target: Buffer
            │   ├─ Create encoding canvas
            │   └─ Add video track (H.264, 5Mbps)
            │
            ├─► Phase 5: Audio Processing (15-20%)
            │   ├─ Setup audio tracks
            │   │  ├─ Find AudioPlayer clips
            │   │  ├─ Fetch audio files
            │   │  └─ Store with timing/volume
            │   └─ Process audio samples
            │      ├─ Decode with Web Audio API
            │      ├─ Apply volume adjustments
            │      ├─ Convert to Float32
            │      └─ Encode to AAC (128kbps)
            │
            ├─► Phase 6: Frame Rendering (25-100%)
            │   │   ┌───────────────────────────────────┐
            │   └─► │ For each frame (0 to total-1):   │
            │       │ ┌─────────────────────────────────┤
            │       │ │ 1. Set playback time            │
            │       │ │ 2. Update all clips             │
            │       │ │ 3. Process video clips:         │
            │       │ │    ├─ Extract frame at time     │
            │       │ │    ├─ Create static texture     │
            │       │ │    └─ Replace live texture      │
            │       │ │ 4. Render scene (PixiJS)        │
            │       │ │ 5. Extract pixels               │
            │       │ │ 6. Convert to ImageData         │
            │       │ │ 7. Write to canvas              │
            │       │ │ 8. Add frame to encoder         │
            │       │ │ 9. Update progress UI           │
            │       │ └─────────────────────────────────┘
            │       └───────────────────────────────────┘
            │
            └─► Phase 7: Finalization (100%)
                ├─ Finalize encoding
                │  ├─ Complete video track
                │  ├─ Complete audio track
                │  └─ Write MP4 headers
                ├─ Create download
                │  ├─ Get buffer from target
                │  ├─ Create Blob (video/mp4)
                │  ├─ Create object URL
                │  ├─ Trigger download
                │  └─ Revoke URL
                └─ Restore state
                   ├─ Restore video textures
                   ├─ Re-enable playback updates
                   ├─ Restore position/zoom
                   ├─ Restore playback state
                   └─ Remove progress UI
```

## Component Interaction

```
┌──────────────────┐
│ VideoExporter    │  Main coordinator
│(ExportCoordinator)│
└────────┬─────────┘
         │
         ├──► ┌───────────────────┐
         │    │ ExportCommand     │  Captures edit state
         │    └───────────────────┘
         │
         ├──► ┌─────────────────────┐
         │    │ VideoFrameProcessor │  Handles video frames
         │    │  ├─ Frame cache     │  - Extracts frames
         │    │  ├─ Texture cache   │  - Manages textures
         │    │  └─ Video elements  │  - Caches for speed
         │    └─────────────────────┘
         │
         ├──► ┌─────────────────────┐
         │    │ AudioProcessor      │  Processes audio
         │    │  ├─ Find players    │  - Fetches audio
         │    │  ├─ Decode audio    │  - Decodes samples
         │    │  └─ Encode AAC      │  - Mixes tracks
         │    └─────────────────────┘
         │
         ├──► ┌─────────────────────┐
         │    │ ExportProgressUI    │  Shows progress
         │    │  ├─ Modal overlay   │  - Creates overlay
         │    │  ├─ Progress bar    │  - Updates bar
         │    │  └─ Status text     │  - Shows status
         │    └─────────────────────┘
         │
         └──► ┌─────────────────────┐
              │ mediabunny Output   │  Encodes & muxes
              │  ├─ CanvasSource    │  - Video encoding
              │  ├─ AudioSource     │  - Audio encoding
              │  ├─ Mp4OutputFormat │  - MP4 container
              │  └─ BufferTarget    │  - In-memory buffer
              └─────────────────────┘
```

## Video Frame Processing Detail

```
┌────────────────────────────────────────────────────────────┐
│          Video Clip Frame Extraction Process                │
└────────────────────────────────────────────────────────────┘

Video Clip in Timeline
       │
       ├─► VideoFrameProcessor.replaceVideoTexture(player, time)
       │
       ├─► Check Frame Cache
       │   ├─ Hit: Return cached ImageData
       │   └─ Miss: Extract new frame
       │       │
       │       ├─► Seek video element to timestamp
       │       │   └─ Wait for 'seeked' event
       │       │
       │       ├─► Draw to extraction canvas (4K)
       │       │   └─ canvas.drawImage(video, ...)
       │       │
       │       ├─► Extract ImageData
       │       │   └─ ctx.getImageData(...)
       │       │
       │       └─► Cache ImageData (LRU, 10 items)
       │
       ├─► Check Texture Cache
       │   ├─ Hit: Reuse existing texture
       │   └─ Miss: Create new texture
       │       │
       │       ├─► Create temp canvas
       │       ├─► Put ImageData on canvas
       │       ├─► Create PixiJS Texture
       │       └─► Cache texture (LRU, 5 items)
       │
       ├─► Replace Player Texture
       │   ├─ Save original texture source (first time)
       │   ├─ Set player.texture = staticTexture
       │   ├─ Update sprite texture
       │   └─ Mark skipVideoUpdate = true
       │
       └─► On Export Complete: Restore
           ├─ Restore original texture source
           ├─ Restore original video element
           └─ Clear skipVideoUpdate flag

```

## Audio Processing Detail

```
┌────────────────────────────────────────────────────────────┐
│              Audio Track Processing Flow                    │
└────────────────────────────────────────────────────────────┘

Timeline with Audio Clips
       │
       ├─► AudioProcessor.setupAudioTracks(tracks, output)
       │   │
       │   ├─► Find all AudioPlayer clips
       │   │   └─ Scan all tracks for audio assets
       │   │
       │   └─► For each audio player:
       │       ├─ Get asset.src URL
       │       ├─ Fetch audio file (ArrayBuffer)
       │       ├─ Store metadata:
       │       │  ├─ data (ArrayBuffer)
       │       │  ├─ start time (ms)
       │       │  ├─ duration (ms)
       │       │  └─ volume (0-1)
       │       │
       │       └─ Create AudioSampleSource
       │          ├─ codec: 'aac'
       │          └─ bitrate: 128000
       │
       └─► AudioProcessor.processAudioSamples(audioSource)
           │
           └─► For each audio track:
               ├─ Create AudioContext
               ├─ Decode ArrayBuffer → AudioBuffer
               ├─ Get channel data (Float32Array)
               ├─ Apply volume
               ├─ Interleave channels
               ├─ Create AudioSample
               │  ├─ data: Float32Array
               │  ├─ format: 'f32'
               │  ├─ numberOfChannels
               │  ├─ sampleRate
               │  └─ timestamp
               │
               └─ Add to audioSource (encodes to AAC)
```

## Data Flow Summary

```
Edit Project
    ↓
ExportCommand (snapshot)
    ↓
┌─────────────┬─────────────┐
│   Video     │    Audio    │
│   Frames    │   Samples   │
└──────┬──────┴──────┬──────┘
       │             │
VideoFrameProcessor AudioProcessor
       │             │
   PixiJS Render   Web Audio API
       │             │
   Canvas Pixels  Float32 Samples
       │             │
       └──────┬──────┘
              │
      mediabunny Output
       ├─ H.264 Video
       ├─ AAC Audio
       └─ MP4 Container
              │
         Buffer Target
              │
      Blob → Download
```

## Progress Timeline

```
0%   ├──────────────────────────────────────────────────────────┤ 100%
     │                                                              │
     ├─► 0-10%:   Initialization & Video Preparation
     │
     ├─► 10-15%:  Output Setup
     │
     ├─► 15-20%:  Audio Processing
     │
     ├─► 20-25%:  Audio Encoding
     │
     ├─► 25-100%: Frame-by-Frame Rendering
     │            (75% of total time)
     │            ├─ Update playback
     │            ├─ Process video clips
     │            ├─ Render frame
     │            ├─ Extract pixels
     │            ├─ Encode frame
     │            └─ Repeat for each frame
     │
     └─► 100%:    Finalization & Download
```

## Error Handling Flow

```
export() called
    ↓
Browser Check
    ├─ WebCodecs available? ─No─► BrowserCompatibilityError
    └─ Yes
        ↓
Export in progress?
    ├─ Yes ─► ExportError("Export in progress")
    └─ No
        ↓
Try Export Process
    ├─ Success ─► Complete & Download
    │
    └─ Error
        ├─ instanceof ExportError ─► Re-throw
        └─ Other ─► Wrap in ExportError
                      ↓
                   Finally Block
                   ├─ Restore edit state
                   ├─ Remove progress UI
                   ├─ Resume ticker
                   └─ Clear export mode
```

## Key Technologies

```
┌─────────────────────────────────────────────────────────────┐
│                    Technology Stack                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Browser APIs:                                                │
│  ├─ WebCodecs API (VideoEncoder)     [Encoding]             │
│  ├─ Web Audio API (AudioContext)     [Audio decode]         │
│  ├─ Canvas API (2D Context)          [Frame extraction]     │
│  └─ Blob API / Download               [File creation]       │
│                                                               │
│  External Libraries:                                          │
│  ├─ mediabunny                        [MP4 muxing]          │
│  │  ├─ Output, Mp4OutputFormat                               │
│  │  ├─ BufferTarget                                          │
│  │  ├─ CanvasSource (video)                                  │
│  │  └─ AudioSampleSource (audio)                             │
│  │                                                            │
│  ├─ PixiJS                            [Rendering]           │
│  │  ├─ Application, Renderer                                 │
│  │  ├─ Texture, Sprite                                       │
│  │  └─ extract.pixels()                                      │
│  │                                                            │
│  └─ Shotstack Canvas                 [Player management]    │
│     ├─ VideoPlayer, AudioPlayer                              │
│     └─ Asset types                                           │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

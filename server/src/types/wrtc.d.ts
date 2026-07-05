declare module "@roamhq/wrtc" {
  export const RTCPeerConnection: {
    new (configuration?: RTCConfiguration): RTCPeerConnection;
    prototype: RTCPeerConnection;
  };
  export const RTCSessionDescription: {
    new (descriptionInitDict?: RTCSessionDescriptionInit): RTCSessionDescription;
    prototype: RTCSessionDescription;
  };
  export const RTCIceCandidate: {
    new (candidateInitDict?: RTCIceCandidateInit): RTCIceCandidate;
    prototype: RTCIceCandidate;
  };
  export const MediaStream: {
    new (stream?: MediaStream | MediaStreamTrack[]): MediaStream;
    prototype: MediaStream;
  };
  export const RTCRtpTransceiver: {
    prototype: RTCRtpTransceiver;
  };
  export const nonstandard: {
    RTCAudioSource: {
      new (): RTCAudioSource;
    };
    RTCVideoSource: {
      new (): RTCVideoSource;
    };
    RTCAudioSink: {
      new (track: MediaStreamTrack): RTCAudioSink;
    };
    RTCVideoSink: {
      new (track: MediaStreamTrack): RTCVideoSink;
    };
  };
}

interface RTCAudioSource {
  createTrack(): MediaStreamTrack;
  onData(data: { samples: Int16Array; sampleRate: number; bitsPerSample: number; numberOfChannels: number }): void;
}

interface RTCVideoSource {
  createTrack(): MediaStreamTrack;
  onFrame(frame: { width: number; height: number; data: Uint8Array }): void;
}

interface RTCAudioSink {
  stop(): void;
  ondata: ((data: { samples: Int16Array; sampleRate: number }) => void) | null;
}

interface RTCVideoSink {
  stop(): void;
  onframe: ((frame: { width: number; height: number; data: Uint8Array }) => void) | null;
}

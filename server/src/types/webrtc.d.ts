/**
 * Minimal WebRTC type declarations for server-side SFU.
 * Only the interfaces actually used by sfu.ts are declared here.
 */

interface RTCConfiguration {
  iceServers?: RTCIceServer[];
  portRange?: { min?: number; max?: number };
}

interface RTCIceServer {
  urls?: string | string[];
  username?: string;
  credential?: string;
}

interface RTCPeerConnection extends EventTarget {
  localDescription: RTCSessionDescription | null;
  remoteDescription: RTCSessionDescription | null;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  iceGatheringState: RTCIceGatheringState;
  signalingState: RTCSignalingState;
  createOffer(): Promise<RTCSessionDescriptionInit>;
  createAnswer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(desc: RTCSessionDescriptionInit | RTCSessionDescription): Promise<void>;
  setRemoteDescription(desc: RTCSessionDescriptionInit | RTCSessionDescription): Promise<void>;
  addIceCandidate(candidate: RTCIceCandidateInit | RTCIceCandidate): Promise<void>;
  addTrack(track: MediaStreamTrack, ...streams: MediaStream[]): RTCRtpSender;
  removeTrack(sender: RTCRtpSender): void;
  getSenders(): RTCRtpSender[];
  getStats(): Promise<RTCStatsReport>;
  close(): void;
  ontrack: ((ev: RTCTrackEvent) => void) | null;
  onicecandidate: ((ev: RTCPeerConnectionIceEvent) => void) | null;
  onconnectionstatechange: (() => void) | null;
  oniceconnectionstatechange: (() => void) | null;
  onicegatheringstatechange: (() => void) | null;
  onsignalingstatechange: (() => void) | null;
  onnegotiationneeded: (() => void) | null;
}

type RTCPeerConnectionState = "new" | "connecting" | "connected" | "disconnected" | "failed" | "closed";
type RTCIceConnectionState = "new" | "checking" | "connected" | "completed" | "failed" | "disconnected" | "closed";
type RTCIceGatheringState = "new" | "gathering" | "complete";
type RTCSignalingState = "stable" | "have-local-offer" | "have-remote-offer" | "have-local-pranswer" | "have-remote-pranswer" | "closed";

interface RTCStatsReport extends Map<string, any> {}

interface RTCSessionDescription {
  type: RTCSdpType;
  sdp: string;
}

interface RTCSessionDescriptionInit {
  type: RTCSdpType;
  sdp?: string;
}

type RTCSdpType = "offer" | "pranswer" | "answer" | "rollback";

interface RTCIceCandidate {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  toJSON(): RTCIceCandidateInit;
}

interface RTCIceCandidateInit {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

interface MediaStreamTrack {
  kind: "audio" | "video";
  id: string;
  enabled: boolean;
  readyState: MediaStreamTrackState;
  stop(): void;
  clone(): MediaStreamTrack;
}

type MediaStreamTrackState = "live" | "ended";

interface MediaStream {
  getAudioTracks(): MediaStreamTrack[];
  getVideoTracks(): MediaStreamTrack[];
  getTracks(): MediaStreamTrack[];
}

interface RTCRtpSender {
  track: MediaStreamTrack | null;
  getParameters(): RTCRtpSendParameters;
  setParameters(params: RTCRtpSendParameters): Promise<void>;
}

interface RTCRtpSendParameters {
  encodings?: RTCRtpEncodingParameters[];
}

interface RTCRtpEncodingParameters {
  maxBitrate?: number;
}

interface RTCRtpTransceiver {
  mid: string | null;
}

interface RTCTrackEvent {
  track: MediaStreamTrack;
  transceiver: RTCRtpTransceiver;
}

interface RTCPeerConnectionIceEvent {
  candidate: RTCIceCandidate | null;
}

interface EventTarget {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void;
}

type EventListenerOrEventListenerObject = EventListener | { handleEvent: (event: Event) => void };
type EventListener = (evt: Event) => void;
interface Event {}

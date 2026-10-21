/** One WAV per mixer channel. Lead is still a synthesizer, not a voice. */

import { CHANNEL_LABEL, channelOrder } from "./mixer.js";

export function stemList(mixer) {
  return channelOrder(mixer).map((id) => ({
    id,
    label: CHANNEL_LABEL[id] || id,
    file: `${CHANNEL_LABEL[id] || id}.wav`,
  }));
}

export function mixerForStem(mixer, id) {
  return {
    master: mixer?.master ?? 0.85,
    channels: Object.fromEntries(Object.entries(mixer?.channels || {}).map(([key, channel]) => [
      key,
      { ...channel, mute: key !== id, solo: false },
    ])),
  };
}

import type { Player } from "@canvas/players/player";
import type { ClipSchema } from "@schemas/clip";
import type { TextAsset } from "@schemas/text-asset";
import type { z } from "zod";

import type { EditCommand, CommandContext } from "./types";

type ClipType = z.infer<typeof ClipSchema>;

export class UpdateTextContentCommand implements EditCommand {
	name = "updateTextContent";
	private previousText: string;

	constructor(
		private clip: Player,
		private newText: string,
		private initialConfig: ClipType
	) {
		const { asset } = this.clip.clipConfiguration;
		this.previousText = asset && "text" in asset ? (asset as TextAsset).text : "";
	}

	execute(context?: CommandContext): void {
		if (!context) return;
		if (this.clip.clipConfiguration.asset && "text" in this.clip.clipConfiguration.asset) {
			(this.clip.clipConfiguration.asset as TextAsset).text = this.newText;

			const textSprite = (this.clip as any).text;
			if (textSprite) {
				textSprite.text = this.newText;
				(this.clip as any).positionText(this.clip.clipConfiguration.asset as TextAsset);
			}

			context.setUpdatedClip(this.clip);

			const trackIndex = this.clip.layer - 1;
			const clips = context.getClips();
			const clipsByTrack = clips.filter((c: Player) => c.layer === this.clip.layer);
			const clipIndex = clipsByTrack.indexOf(this.clip);

			context.emitEvent("clip:updated", {
				previous: { clip: this.initialConfig, trackIndex, clipIndex },
				current: { clip: this.clip.clipConfiguration, trackIndex, clipIndex }
			});
		}
	}

	undo(context?: CommandContext): void {
		if (!context) return;
		if (this.clip.clipConfiguration.asset && "text" in this.clip.clipConfiguration.asset) {
			(this.clip.clipConfiguration.asset as TextAsset).text = this.previousText;

			const textSprite = (this.clip as any).text;
			if (textSprite) {
				textSprite.text = this.previousText;
				(this.clip as any).positionText(this.clip.clipConfiguration.asset as TextAsset);
			}

			context.setUpdatedClip(this.clip);

			const trackIndex = this.clip.layer - 1;
			const clips = context.getClips();
			const clipsByTrack = clips.filter((c: Player) => c.layer === this.clip.layer);
			const clipIndex = clipsByTrack.indexOf(this.clip);

			context.emitEvent("clip:updated", {
				previous: { clip: this.clip.clipConfiguration, trackIndex, clipIndex },
				current: { clip: this.initialConfig, trackIndex, clipIndex }
			});
		}
	}
}

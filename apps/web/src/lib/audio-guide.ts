export interface AudioGuideProvider {
  play(messageKey: string, locale: string): Promise<void>;
  stop(): void;
}

export class BrowserSpeechSynthesisGuide implements AudioGuideProvider {
  public constructor(private readonly resolveMessage: (key: string, locale: string) => string) {}

  public async play(messageKey: string, locale: string): Promise<void> {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    this.stop();
    const utterance = new SpeechSynthesisUtterance(this.resolveMessage(messageKey, locale));
    utterance.lang = locale;
    await new Promise<void>((resolve) => {
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }

  public stop(): void {
    if (typeof window !== "undefined" && "speechSynthesis" in window)
      window.speechSynthesis.cancel();
  }
}

class SoundManager {
  private buyAudio: HTMLAudioElement;
  private sellAudio: HTMLAudioElement;

  constructor() {
    // Buy: Pleasant digital confirm (Soft "Ding")
    this.buyAudio = new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3');
    
    // Sell: Subtle mechanical click or soft alert (Soft "Click/Pop")
    this.sellAudio = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3');
    
    this.buyAudio.volume = 0.4; // Not too loud
    this.sellAudio.volume = 0.4;
    
    this.buyAudio.preload = 'auto';
    this.sellAudio.preload = 'auto';
  }

  playBuy() {
    this.buyAudio.currentTime = 0;
    this.buyAudio.play().catch(e => console.warn("Sound play blocked", e));
  }

  playSell() {
    this.sellAudio.currentTime = 0;
    this.sellAudio.play().catch(e => console.warn("Sound play blocked", e));
  }
}

export const soundManager = new SoundManager();
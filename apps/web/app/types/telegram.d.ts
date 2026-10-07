// Подмножество Telegram WebApp API (telegram-web-app.js), которое используем.
// https://core.telegram.org/bots/webapps#initializing-mini-apps

type TelegramBottomButtonParams = {
  text?: string;
  is_active?: boolean;
  is_visible?: boolean;
};

interface TelegramBottomButton {
  setParams(params: TelegramBottomButtonParams): TelegramBottomButton;
  show(): TelegramBottomButton;
  hide(): TelegramBottomButton;
  showProgress(leaveActive?: boolean): TelegramBottomButton;
  hideProgress(): TelegramBottomButton;
  onClick(callback: () => void): TelegramBottomButton;
  offClick(callback: () => void): TelegramBottomButton;
}

interface TelegramBackButton {
  show(): TelegramBackButton;
  hide(): TelegramBackButton;
  onClick(callback: () => void): TelegramBackButton;
  offClick(callback: () => void): TelegramBackButton;
}

interface TelegramHapticFeedback {
  selectionChanged(): TelegramHapticFeedback;
  notificationOccurred(type: 'error' | 'success' | 'warning'): TelegramHapticFeedback;
}

interface TelegramWebApp {
  initData: string;
  version: string;
  isVersionAtLeast(version: string): boolean;
  ready(): void;
  expand(): void;
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  MainButton: TelegramBottomButton;
  BackButton: TelegramBackButton;
  HapticFeedback: TelegramHapticFeedback;
}

interface Window {
  Telegram?: { WebApp?: TelegramWebApp };
}

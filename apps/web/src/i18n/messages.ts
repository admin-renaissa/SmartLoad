export type UiLang = 'en' | 'hi';

const M = {
  en: {
    scanOfflineBanner: (n: number) =>
      `Offline — ${n} scan(s) queued. They will send automatically when you are back online.`,
    scanLangLabel: 'Language',
  },
  hi: {
    scanOfflineBanner: (n: number) =>
      `ऑफ़लाइन — ${n} स्कैन कतार में। ऑनलाइन होने पर स्वतः भेजे जाएँगे।`,
    scanLangLabel: 'भाषा',
  },
} as const;

/** Public POD flow — same storage key as scan/settings (`smartload-ui-lang`). */
export const POD_UIcopy = {
  en: {
    langEn: 'English',
    langHi: 'हिंदी',
    title: 'Delivery Acknowledgement',
    po: 'PO',
    invalidTitle: 'Invalid link',
    invalidBody: 'This delivery acknowledgement link is not valid. Please check the message from your supplier.',
    expiredTitle: 'Link Expired',
    expiredBody: 'This delivery acknowledgement link has expired. Please contact your supplier.',
    doneTitle: 'Delivery Acknowledged ✓',
    doneThanks: (name: string) => `Thank you, ${name}! Your acknowledgement has been recorded.`,
    deliveryDetails: 'Delivery Details',
    vehicle: 'Vehicle',
    driver: 'Driver',
    client: 'Client',
    yourMobile: 'Your Mobile Number',
    mobilePlaceholder: '10-digit mobile',
    sendOtp: 'Send OTP to Verify',
    otpPrompt: 'Enter the 6-digit OTP sent to your mobile',
    verifyOtp: 'Verify OTP',
    confirmQty: 'Confirm quantities received',
    dispatched: 'Disp.',
    receivedBoxes: 'Received boxes',
    shortageReason: 'Reason for shortage (optional)',
    receiverName: 'Your Name (Receiver)',
    fullNamePh: 'Full name',
    continueSignature: 'Continue to signature',
    signHint: 'Sign below to confirm receipt (optional but recommended).',
    clearSig: 'Clear signature',
    submit: 'Submit acknowledgement',
    toastOtpSent: 'OTP sent!',
    toastOtpInvalid: 'Invalid OTP. Please try again.',
    toastSubmitted: 'Acknowledgement submitted',
    toastSubmitErr: 'Could not submit. Try again.',
  },
  hi: {
    langEn: 'English',
    langHi: 'हिंदी',
    title: 'डिलीवरी पुष्टिकरण',
    po: 'पीओ',
    invalidTitle: 'लिंक अमान्य',
    invalidBody:
      'यह डिलीवरी पुष्टिकरण लिंक मान्य नहीं है। कृपया आपूर्तिकर्ता के संदेश को जाँचें।',
    expiredTitle: 'लिंक समाप्त',
    expiredBody:
      'यह डिलीवरी लिंक समाप्त हो गया है। कृपया आपूर्तिकर्ता से संपर्क करें।',
    doneTitle: 'डिलीवरी स्वीकृत ✓',
    doneThanks: (name: string) => `धन्यवाद, ${name}! आपकी पुष्टि दर्ज कर ली गई है।`,
    deliveryDetails: 'डिलीवरी विवरण',
    vehicle: 'वाहन',
    driver: 'चालक',
    client: 'ग्राहक',
    yourMobile: 'आपका मोबाइल नंबर',
    mobilePlaceholder: '10 अंक',
    sendOtp: 'ओटीपी भेजें',
    otpPrompt: 'अपने मोबाइल पर भेजे 6 अंकों का ओटीपी दर्ज करें',
    verifyOtp: 'ओटीपी सत्यापित करें',
    confirmQty: 'प्राप्त मात्रा की पुष्टि करें',
    dispatched: 'भेजा',
    receivedBoxes: 'प्राप्त बक्से',
    shortageReason: 'कमी का कारण (वैकल्पिक)',
    receiverName: 'आपका नाम (प्राप्तकर्ता)',
    fullNamePh: 'पूरा नाम',
    continueSignature: 'हस्ताक्षर पर जाएँ',
    signHint:
      'प्राप्ति की पुष्टि के लिए नीचे हस्ताक्षर करें (वैकल्पिक, सुझावित)।',
    clearSig: 'हस्ताक्षर मिटाएँ',
    submit: 'पुष्टिकरण जमा करें',
    toastOtpSent: 'ओटीपी भेज दिया गया!',
    toastOtpInvalid: 'अमान्य ओटीपी। पुनः प्रयास करें।',
    toastSubmitted: 'पुष्टिकरण जमा हो गया',
    toastSubmitErr: 'जमा नहीं हो सका। पुनः प्रयास करें।',
  },
} as const;

export type PodCopy = (typeof POD_UIcopy)[UiLang];

export function getUiLang(): UiLang {
  if (typeof window === 'undefined') return 'en';
  const v = localStorage.getItem('smartload-ui-lang');
  return v === 'hi' ? 'hi' : 'en';
}

export function setUiLang(lang: UiLang): void {
  localStorage.setItem('smartload-ui-lang', lang);
}

export function podCopy(): PodCopy {
  return getUiLang() === 'hi' ? POD_UIcopy.hi : POD_UIcopy.en;
}

export function offlineBannerText(n: number): string {
  return getUiLang() === 'hi' ? M.hi.scanOfflineBanner(n) : M.en.scanOfflineBanner(n);
}

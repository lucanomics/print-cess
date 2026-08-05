export const SUPPORTED_LOCALES = [
  "en",
  "ko",
  "zh-CN",
  "id",
  "fil",
  "vi",
  "th",
  "ne",
  "km",
  "ar",
  "ru",
  "mn",
  "uk",
] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_NAMES: Record<SupportedLocale, string> = {
  en: "English",
  ko: "한국어",
  "zh-CN": "简体中文",
  id: "Bahasa Indonesia",
  fil: "Filipino",
  vi: "Tiếng Việt",
  th: "ไทย",
  ne: "नेपाली",
  km: "ខ្មែរ",
  ar: "العربية",
  ru: "Русский",
  mn: "Монгол",
  uk: "Українська",
};

// Right-to-left locales need `dir="rtl"` on the document element.
export const RTL_LOCALES: readonly SupportedLocale[] = ["ar"];

export function isRightToLeft(locale: SupportedLocale): boolean {
  return RTL_LOCALES.includes(locale);
}

// English is the source of truth: every other locale must provide exactly these
// keys, which `satisfies Translation` enforces at build time.
const en = {
  brand: "Print-cess by Paradiso",

  selectLanguage: "Choose your language",
  selectLanguageHint: "Tap your language. Then tap the button at the bottom.",
  step: "Step {{current}} of {{total}}",
  continue: "Continue",

  guideTitle: "How to print",
  guideIntro: "Four easy steps. You do not need an app or an account.",
  guideScanTitle: "1. Scan the QR code",
  guideScanBody: "You scanned it with your phone camera. This step is done.",
  guideChooseTitle: "2. Pick one file",
  guideChooseBody: "One photo, or one PDF you saved on your phone.",
  guideCheckTitle: "3. Check it, then print",
  guideCheckBody: "Look at the picture on your phone, then tap the print button.",
  guideCollectTitle: "4. Take your paper",
  guideCollectBody: "The printer stands next to the big screen. Take your paper there.",
  guideListen: "Listen to the steps",
  guideStart: "Pick my file",
  languageReminder: "Tap your language, then tap Continue.",
  guideReminder: "Read the four steps, then tap the button at the bottom.",

  chooseFile: "Pick one file to print",
  fileRules: "PDF, JPG or PNG · up to 10 MB · up to 10 pages",
  locationPhotos: "Open my photos",
  locationFiles: "Open my files",
  cancelled: "No file yet. Tap one of the two buttons below.",

  checkDocument: "Is this the right page?",
  previewHelp: "The printer prints exactly what you see below. Look at it carefully.",
  printSummary: "1 copy · A4 paper · black and white · one side",
  privacySummary: "Your file is locked while it travels, and erased right after printing.",
  printOneCopy: "Print 1 copy",
  chooseAnother: "Pick a different file",

  encrypting: "Getting your file ready",
  uploading: "Sending your file",
  waitingForPrint: "The printer is starting",
  completed: "All done",
  collectOutput: "Take your paper from the printer.",
  listenAgain: "Listen again",
  keepPageOpen: "Do not close this page.",
  preparingSession: "Getting ready…",

  documentPreview: "Document preview",
  selectedDocumentPreview: "Preview of the file you picked",
  pdfPreview: "PDF preview",
  firstPagePreview: "Preview of the first page",

  invalidQr: "This link is not complete. Scan the QR code on the big screen again.",
  expiredQr: "This QR code is too old. Scan the new QR code on the big screen.",
  usedQr: "Someone is already using this QR code. Scan the new one on the big screen.",
  unsupportedType:
    "You can print PDF, JPG and PNG only. Save your page as a PDF, or take a clear screenshot.",
  tooLarge: "This file is bigger than 10 MB. Save only the pages you need, or take a screenshot.",
  tooManyPages: "This PDF has more than 10 pages. Save only the pages you need.",
  lockedPdf:
    "This PDF has a password. Open it on your phone and take a screenshot of the pages you need.",
  damagedFile: "This file will not open. Save it again, or take a clear screenshot.",
  fingerprintMismatch:
    "This connection could not be checked. Scan the QR code on the big screen again.",
  networkError: "The connection stopped. Check your mobile data, then scan the QR code again.",

  chooseLocation: "Where is your file?",
  locationKakao: "In KakaoTalk",
  locationEmail: "In email",
  locationMissing: "I do not have the file",
  kakaoGuide:
    "Open the file in KakaoTalk, tap Share, and save it to your phone. Then come back here.",
  emailGuide: "Open the email attachment on your phone and save it. Then come back here.",
  missingTitle: "We cannot find a document for you or make a new one.",
  missingBody:
    "Ask the person who booked it, your airline, or your travel agency to send it to your phone.",

  helpOpen: "Need help?",
  helpTitle: "What do I do now?",
  helpClose: "Got it",
  helpLanguage: "Tap the box with your language in it. Then tap the button at the bottom.",
  helpGuide: "Read the four short steps. Then tap the button at the bottom to pick your file.",
  helpFile:
    "Is your page a photo? Tap “Open my photos”. Is it a PDF you saved? Tap “Open my files”. Pick one file only.",
  helpPreview:
    "Look at the picture. If it is the right page, tap “Print 1 copy”. If it is the wrong page, tap “Pick a different file”.",
  helpProgress: "Nothing to do now. Keep this page open and wait. Your paper comes out soon.",
  helpDone: "Your paper is at the printer next to the big screen. Take it with you.",
  helpError: "Go to the big screen, scan the QR code again, and start over.",
  helpAskStaff: "Still stuck? Ask a staff member near the printer.",

  kioskScanTitle: "Scan this QR code with your phone camera",
  kioskNoWifi: "No Wi-Fi needed — use your phone data",
};

export type TranslationKey = keyof typeof en;
type Translation = Record<TranslationKey, string>;

const ko = {
  brand: "Print-cess by Paradiso",

  selectLanguage: "언어를 선택하세요",
  selectLanguageHint: "사용할 언어를 누르세요. 그다음 아래 버튼을 누르세요.",
  step: "{{total}}단계 중 {{current}}단계",
  continue: "계속",

  guideTitle: "인쇄 방법",
  guideIntro: "네 단계만 하면 됩니다. 앱을 설치하거나 로그인하지 않아도 돼요.",
  guideScanTitle: "1. QR코드 스캔하기",
  guideScanBody: "휴대전화 카메라로 스캔했어요. 이 단계는 끝났습니다.",
  guideChooseTitle: "2. 문서 한 개 고르기",
  guideChooseBody: "사진 한 장, 또는 휴대전화에 저장한 PDF 한 개를 고르세요.",
  guideCheckTitle: "3. 확인하고 인쇄하기",
  guideCheckBody: "휴대전화에 보이는 그림을 확인한 뒤 인쇄 버튼을 누르세요.",
  guideCollectTitle: "4. 출력물 가져가기",
  guideCollectBody: "프린터는 큰 화면 옆에 있어요. 거기에서 종이를 가져가세요.",
  guideListen: "음성으로 듣기",
  guideStart: "문서 고르기",
  languageReminder: "언어를 누른 뒤 ‘계속’을 누르세요.",
  guideReminder: "네 단계를 읽고 아래 버튼을 누르세요.",

  chooseFile: "인쇄할 문서 한 개를 고르세요",
  fileRules: "PDF, JPG, PNG · 10MB 이하 · 10페이지 이하",
  locationPhotos: "사진에서 고르기",
  locationFiles: "파일에서 고르기",
  cancelled: "아직 고른 문서가 없어요. 아래 두 버튼 중 하나를 누르세요.",

  checkDocument: "이 문서가 맞나요?",
  previewHelp: "아래에 보이는 그대로 인쇄됩니다. 잘 확인하세요.",
  printSummary: "한 부 · A4 용지 · 흑백 · 단면",
  privacySummary: "문서는 보내는 동안 잠겨 있고, 인쇄가 끝나면 바로 지워집니다.",
  printOneCopy: "A4 한 부 인쇄",
  chooseAnother: "다른 문서 고르기",

  encrypting: "문서를 준비하고 있어요",
  uploading: "문서를 보내고 있어요",
  waitingForPrint: "곧 인쇄가 시작돼요",
  completed: "인쇄가 끝났어요",
  collectOutput: "프린터에서 종이를 가져가세요.",
  listenAgain: "다시 듣기",
  keepPageOpen: "이 화면을 닫지 마세요.",
  preparingSession: "안전하게 연결하고 있어요…",

  documentPreview: "문서 미리보기",
  selectedDocumentPreview: "고른 문서 미리보기",
  pdfPreview: "PDF 미리보기",
  firstPagePreview: "첫 페이지 미리보기",

  invalidQr: "QR코드 정보가 완전하지 않아요. 큰 화면의 QR코드를 다시 스캔하세요.",
  expiredQr: "QR코드 사용 시간이 지났어요. 큰 화면의 새 QR코드를 스캔하세요.",
  usedQr: "다른 사람이 사용 중인 QR코드예요. 큰 화면의 새 QR코드를 스캔하세요.",
  unsupportedType:
    "PDF, JPG, PNG만 인쇄할 수 있어요. 문서를 PDF로 저장하거나 화면을 선명하게 캡처하세요.",
  tooLarge: "파일이 10MB보다 커요. 필요한 페이지만 저장하거나 화면을 캡처하세요.",
  tooManyPages: "PDF가 10페이지보다 많아요. 필요한 페이지만 저장하세요.",
  lockedPdf: "암호가 걸린 PDF예요. 휴대전화에서 열어 필요한 페이지를 캡처해 저장하세요.",
  damagedFile: "파일이 열리지 않아요. 다시 저장하거나 화면을 선명하게 캡처하세요.",
  fingerprintMismatch: "안전한 연결을 확인하지 못했어요. 큰 화면의 QR코드를 다시 스캔하세요.",
  networkError: "연결이 끊겼어요. 모바일 데이터를 확인한 뒤 QR코드를 다시 스캔하세요.",

  chooseLocation: "인쇄할 문서가 어디에 있나요?",
  locationKakao: "카카오톡에 있어요",
  locationEmail: "이메일에 있어요",
  locationMissing: "문서가 없어요",
  kakaoGuide:
    "카카오톡에서 파일을 열고 공유를 누른 뒤 휴대전화에 저장하세요. 그다음 이 화면으로 돌아오세요.",
  emailGuide: "휴대전화에서 이메일 첨부파일을 열어 저장하세요. 그다음 이 화면으로 돌아오세요.",
  missingTitle: "이곳에서는 문서를 찾거나 새로 만들 수 없어요.",
  missingBody: "예약한 분이나 항공사, 여행사에 연락해서 휴대전화로 문서를 받으세요.",

  helpOpen: "도움이 필요해요",
  helpTitle: "지금 무엇을 하면 되나요?",
  helpClose: "알겠어요",
  helpLanguage: "내 언어가 적힌 칸을 누르세요. 그다음 아래 버튼을 누르세요.",
  helpGuide: "네 단계를 읽어 보세요. 그다음 아래 버튼을 눌러 문서를 고르세요.",
  helpFile:
    "인쇄할 것이 사진이면 ‘사진에서 고르기’를 누르세요. 저장해 둔 PDF면 ‘파일에서 고르기’를 누르세요. 문서는 한 개만 고를 수 있어요.",
  helpPreview:
    "그림을 보세요. 맞으면 ‘A4 한 부 인쇄’를 누르세요. 아니면 ‘다른 문서 고르기’를 누르세요.",
  helpProgress:
    "지금은 아무것도 누르지 않아도 돼요. 이 화면을 열어 둔 채 기다리세요. 곧 종이가 나옵니다.",
  helpDone: "큰 화면 옆 프린터에 종이가 나와 있어요. 종이를 가져가세요.",
  helpError: "큰 화면으로 가서 QR코드를 다시 스캔한 뒤 처음부터 하세요.",
  helpAskStaff: "그래도 어려우면 프린터 옆 직원에게 도움을 요청하세요.",

  kioskScanTitle: "휴대전화 카메라로 이 QR코드를 스캔하세요",
  kioskNoWifi: "Wi-Fi는 필요 없어요. 휴대전화 데이터를 사용하세요",
} satisfies Translation;

const zhCN = {
  brand: "Print-cess by Paradiso",

  selectLanguage: "选择语言",
  selectLanguageHint: "点一下你的语言，然后点下面的按钮。",
  step: "第 {{current}} 步 / 共 {{total}} 步",
  continue: "继续",

  guideTitle: "怎么打印",
  guideIntro: "只有四步。不用装软件，也不用登录。",
  guideScanTitle: "1. 扫二维码",
  guideScanBody: "你已经用手机相机扫好了，这一步做完了。",
  guideChooseTitle: "2. 选一个文件",
  guideChooseBody: "一张照片，或者手机里存好的一个 PDF。",
  guideCheckTitle: "3. 看一下，然后打印",
  guideCheckBody: "看看手机上的图，然后点打印按钮。",
  guideCollectTitle: "4. 拿走你的纸",
  guideCollectBody: "打印机就在大屏幕旁边，到那里拿纸。",
  guideListen: "听语音说明",
  guideStart: "选择我的文件",
  languageReminder: "点你的语言，然后点“继续”。",
  guideReminder: "看完这四步，再点下面的按钮。",

  chooseFile: "选一个要打印的文件",
  fileRules: "PDF、JPG 或 PNG · 不超过 10 MB · 不超过 10 页",
  locationPhotos: "打开我的照片",
  locationFiles: "打开我的文件",
  cancelled: "还没有选文件。点下面两个按钮中的一个。",

  checkDocument: "这一页对吗？",
  previewHelp: "打印出来就是你下面看到的样子，请仔细看。",
  printSummary: "1 份 · A4 纸 · 黑白 · 单面",
  privacySummary: "文件在传送时是锁住的，打印完就删掉。",
  printOneCopy: "打印 1 份",
  chooseAnother: "换一个文件",

  encrypting: "正在准备你的文件",
  uploading: "正在发送你的文件",
  waitingForPrint: "打印机就要开始了",
  completed: "全部完成",
  collectOutput: "到打印机那里拿纸。",
  listenAgain: "再听一遍",
  keepPageOpen: "不要关掉这个页面。",
  preparingSession: "正在准备…",

  documentPreview: "文件预览",
  selectedDocumentPreview: "你选的文件预览",
  pdfPreview: "PDF 预览",
  firstPagePreview: "第一页预览",

  invalidQr: "这个链接不完整。请重新扫大屏幕上的二维码。",
  expiredQr: "这个二维码太旧了。请扫大屏幕上新的二维码。",
  usedQr: "这个二维码已经有人在用。请扫大屏幕上新的二维码。",
  unsupportedType: "只能打印 PDF、JPG 和 PNG。请把内容存成 PDF，或者截一张清楚的图。",
  tooLarge: "文件超过 10 MB。只保存需要的几页，或者截图。",
  tooManyPages: "这个 PDF 超过 10 页。只保存你需要的几页。",
  lockedPdf: "这个 PDF 有密码。请在手机上打开，把需要的页截图保存。",
  damagedFile: "这个文件打不开。请重新保存，或者截一张清楚的图。",
  fingerprintMismatch: "没办法确认这个连接。请重新扫大屏幕上的二维码。",
  networkError: "连接断了。请检查手机流量，然后重新扫二维码。",

  chooseLocation: "你的文件在哪里？",
  locationKakao: "在 KakaoTalk 里",
  locationEmail: "在邮件里",
  locationMissing: "我没有这个文件",
  kakaoGuide: "在 KakaoTalk 里打开文件，点分享，存到手机里。然后回到这个页面。",
  emailGuide: "在手机上打开邮件附件并保存。然后回到这个页面。",
  missingTitle: "我们没办法帮你找文件，也没办法开新的。",
  missingBody: "请找帮你预订的人、航空公司或旅行社，把文件发到你的手机上。",

  helpOpen: "需要帮忙",
  helpTitle: "我现在该做什么？",
  helpClose: "知道了",
  helpLanguage: "点一下写着你的语言的那一格，然后点下面的按钮。",
  helpGuide: "看完这四步，然后点下面的按钮去选文件。",
  helpFile: "要打印的是照片，就点“打开我的照片”。是存好的 PDF，就点“打开我的文件”。只能选一个。",
  helpPreview: "看看那张图。对的话就点“打印 1 份”。不对就点“换一个文件”。",
  helpProgress: "现在什么都不用点。开着这个页面等一下，纸马上出来。",
  helpDone: "纸在大屏幕旁边的打印机上，请拿走。",
  helpError: "回到大屏幕，重新扫二维码，从头再来一次。",
  helpAskStaff: "还是不会的话，请找打印机旁边的工作人员帮忙。",

  kioskScanTitle: "用手机相机扫这个二维码",
  kioskNoWifi: "不用 Wi-Fi，用手机流量就行",
} satisfies Translation;

const id = {
  brand: "Print-cess by Paradiso",

  selectLanguage: "Pilih bahasa Anda",
  selectLanguageHint: "Ketuk bahasa Anda. Lalu ketuk tombol di bawah.",
  step: "Langkah {{current}} dari {{total}}",
  continue: "Lanjut",

  guideTitle: "Cara mencetak",
  guideIntro: "Hanya empat langkah. Tidak perlu aplikasi atau akun.",
  guideScanTitle: "1. Pindai kode QR",
  guideScanBody: "Anda sudah memindainya dengan kamera ponsel. Langkah ini selesai.",
  guideChooseTitle: "2. Pilih satu berkas",
  guideChooseBody: "Satu foto, atau satu PDF yang tersimpan di ponsel Anda.",
  guideCheckTitle: "3. Periksa, lalu cetak",
  guideCheckBody: "Lihat gambar di ponsel Anda, lalu ketuk tombol cetak.",
  guideCollectTitle: "4. Ambil kertas Anda",
  guideCollectBody: "Printer ada di samping layar besar. Ambil kertas Anda di sana.",
  guideListen: "Dengarkan langkahnya",
  guideStart: "Pilih berkas saya",
  languageReminder: "Ketuk bahasa Anda, lalu ketuk Lanjut.",
  guideReminder: "Baca empat langkah itu, lalu ketuk tombol di bawah.",

  chooseFile: "Pilih satu berkas untuk dicetak",
  fileRules: "PDF, JPG, atau PNG · maksimal 10 MB · maksimal 10 halaman",
  locationPhotos: "Buka foto saya",
  locationFiles: "Buka berkas saya",
  cancelled: "Belum ada berkas. Ketuk salah satu dari dua tombol di bawah.",

  checkDocument: "Apakah ini halaman yang benar?",
  previewHelp: "Printer mencetak tepat seperti yang Anda lihat di bawah. Periksa dengan teliti.",
  printSummary: "1 salinan · kertas A4 · hitam putih · satu sisi",
  privacySummary: "Berkas Anda terkunci saat dikirim, dan dihapus tepat setelah dicetak.",
  printOneCopy: "Cetak 1 salinan",
  chooseAnother: "Pilih berkas lain",

  encrypting: "Menyiapkan berkas Anda",
  uploading: "Mengirim berkas Anda",
  waitingForPrint: "Printer akan mulai",
  completed: "Selesai",
  collectOutput: "Ambil kertas Anda dari printer.",
  listenAgain: "Dengarkan lagi",
  keepPageOpen: "Jangan tutup halaman ini.",
  preparingSession: "Sedang bersiap…",

  documentPreview: "Pratinjau dokumen",
  selectedDocumentPreview: "Pratinjau berkas yang Anda pilih",
  pdfPreview: "Pratinjau PDF",
  firstPagePreview: "Pratinjau halaman pertama",

  invalidQr: "Tautan ini tidak lengkap. Pindai lagi kode QR di layar besar.",
  expiredQr: "Kode QR ini sudah terlalu lama. Pindai kode QR baru di layar besar.",
  usedQr: "Kode QR ini sedang dipakai orang lain. Pindai kode QR baru di layar besar.",
  unsupportedType:
    "Hanya PDF, JPG, dan PNG yang bisa dicetak. Simpan sebagai PDF, atau ambil tangkapan layar yang jelas.",
  tooLarge:
    "Berkas ini lebih dari 10 MB. Simpan hanya halaman yang perlu, atau ambil tangkapan layar.",
  tooManyPages: "PDF ini lebih dari 10 halaman. Simpan hanya halaman yang Anda perlukan.",
  lockedPdf:
    "PDF ini punya kata sandi. Buka di ponsel Anda, lalu simpan halaman yang perlu sebagai tangkapan layar.",
  damagedFile: "Berkas ini tidak bisa dibuka. Simpan ulang, atau ambil tangkapan layar yang jelas.",
  fingerprintMismatch: "Sambungan ini tidak dapat diperiksa. Pindai lagi kode QR di layar besar.",
  networkError: "Sambungan terputus. Periksa data seluler Anda, lalu pindai lagi kode QR.",

  chooseLocation: "Di mana berkas Anda?",
  locationKakao: "Di KakaoTalk",
  locationEmail: "Di email",
  locationMissing: "Saya tidak punya berkasnya",
  kakaoGuide:
    "Buka berkas di KakaoTalk, ketuk Bagikan, lalu simpan ke ponsel Anda. Setelah itu kembali ke sini.",
  emailGuide: "Buka lampiran email di ponsel Anda lalu simpan. Setelah itu kembali ke sini.",
  missingTitle: "Kami tidak bisa mencari dokumen Anda atau membuat yang baru.",
  missingBody:
    "Minta orang yang memesan, maskapai, atau agen perjalanan Anda mengirimkannya ke ponsel Anda.",

  helpOpen: "Perlu bantuan?",
  helpTitle: "Apa yang harus saya lakukan sekarang?",
  helpClose: "Mengerti",
  helpLanguage: "Ketuk kotak yang berisi bahasa Anda. Lalu ketuk tombol di bawah.",
  helpGuide:
    "Baca empat langkah singkat itu. Lalu ketuk tombol di bawah untuk memilih berkas Anda.",
  helpFile:
    "Yang mau dicetak berupa foto? Ketuk “Buka foto saya”. Berupa PDF yang sudah disimpan? Ketuk “Buka berkas saya”. Pilih satu berkas saja.",
  helpPreview:
    "Lihat gambarnya. Kalau sudah benar, ketuk “Cetak 1 salinan”. Kalau salah, ketuk “Pilih berkas lain”.",
  helpProgress:
    "Sekarang tidak perlu menekan apa pun. Biarkan halaman ini terbuka dan tunggu. Kertas segera keluar.",
  helpDone: "Kertas Anda ada di printer di samping layar besar. Silakan ambil.",
  helpError: "Pergi ke layar besar, pindai lagi kode QR, dan mulai dari awal.",
  helpAskStaff: "Masih bingung? Tanya petugas di dekat printer.",

  kioskScanTitle: "Pindai kode QR ini dengan kamera ponsel Anda",
  kioskNoWifi: "Tidak perlu Wi-Fi — pakai data seluler Anda",
} satisfies Translation;

const fil = {
  brand: "Print-cess by Paradiso",

  selectLanguage: "Piliin ang wika mo",
  selectLanguageHint: "I-tap ang wika mo. Pagkatapos, i-tap ang butones sa ibaba.",
  step: "Hakbang {{current}} sa {{total}}",
  continue: "Magpatuloy",

  guideTitle: "Paano mag-print",
  guideIntro: "Apat na hakbang lang. Hindi kailangan ng app o account.",
  guideScanTitle: "1. I-scan ang QR code",
  guideScanBody: "Na-scan mo na ito sa camera ng telepono mo. Tapos na ang hakbang na ito.",
  guideChooseTitle: "2. Pumili ng isang file",
  guideChooseBody: "Isang larawan, o isang PDF na nasa telepono mo.",
  guideCheckTitle: "3. Tingnan, pagkatapos i-print",
  guideCheckBody: "Tingnan ang larawan sa telepono mo, pagkatapos i-tap ang butones ng print.",
  guideCollectTitle: "4. Kunin ang papel mo",
  guideCollectBody: "Nasa tabi ng malaking screen ang printer. Kunin doon ang papel mo.",
  guideListen: "Pakinggan ang mga hakbang",
  guideStart: "Pumili ng file",
  languageReminder: "I-tap ang wika mo, pagkatapos i-tap ang Magpatuloy.",
  guideReminder: "Basahin ang apat na hakbang, pagkatapos i-tap ang butones sa ibaba.",

  chooseFile: "Pumili ng isang file na ipi-print",
  fileRules: "PDF, JPG, o PNG · hanggang 10 MB · hanggang 10 pahina",
  locationPhotos: "Buksan ang mga larawan ko",
  locationFiles: "Buksan ang mga file ko",
  cancelled: "Wala pang file. I-tap ang isa sa dalawang butones sa ibaba.",

  checkDocument: "Tama ba ang pahinang ito?",
  previewHelp: "Kung ano ang nasa ibaba, iyon ang ipi-print. Tingnan itong mabuti.",
  printSummary: "1 kopya · papel na A4 · itim at puti · isang panig",
  privacySummary:
    "Nakakandado ang file mo habang ipinapadala, at buburahin agad pagkatapos mag-print.",
  printOneCopy: "I-print ang 1 kopya",
  chooseAnother: "Pumili ng ibang file",

  encrypting: "Inihahanda ang file mo",
  uploading: "Ipinapadala ang file mo",
  waitingForPrint: "Magsisimula na ang printer",
  completed: "Tapos na",
  collectOutput: "Kunin ang papel mo sa printer.",
  listenAgain: "Pakinggan muli",
  keepPageOpen: "Huwag isara ang pahinang ito.",
  preparingSession: "Naghahanda…",

  documentPreview: "Preview ng dokumento",
  selectedDocumentPreview: "Preview ng file na pinili mo",
  pdfPreview: "Preview ng PDF",
  firstPagePreview: "Preview ng unang pahina",

  invalidQr: "Kulang ang link na ito. I-scan muli ang QR code sa malaking screen.",
  expiredQr: "Masyado nang matagal ang QR code na ito. I-scan ang bago sa malaking screen.",
  usedQr: "May gumagamit na ng QR code na ito. I-scan ang bago sa malaking screen.",
  unsupportedType:
    "PDF, JPG, at PNG lang ang maaaring i-print. I-save bilang PDF, o kumuha ng malinaw na screenshot.",
  tooLarge:
    "Mahigit 10 MB ang file na ito. I-save lang ang mga pahinang kailangan, o kumuha ng screenshot.",
  tooManyPages: "Mahigit 10 pahina ang PDF na ito. I-save lang ang mga pahinang kailangan mo.",
  lockedPdf:
    "May password ang PDF na ito. Buksan ito sa telepono mo at i-screenshot ang mga pahinang kailangan.",
  damagedFile:
    "Hindi mabuksan ang file na ito. I-save itong muli, o kumuha ng malinaw na screenshot.",
  fingerprintMismatch:
    "Hindi masuri ang koneksyong ito. I-scan muli ang QR code sa malaking screen.",
  networkError:
    "Nawala ang koneksyon. Tingnan ang mobile data mo, pagkatapos i-scan muli ang QR code.",

  chooseLocation: "Nasaan ang file mo?",
  locationKakao: "Sa KakaoTalk",
  locationEmail: "Sa email",
  locationMissing: "Wala sa akin ang file",
  kakaoGuide:
    "Buksan ang file sa KakaoTalk, i-tap ang Ibahagi, at i-save sa telepono mo. Pagkatapos, bumalik dito.",
  emailGuide: "Buksan ang attachment sa email sa telepono mo at i-save. Pagkatapos, bumalik dito.",
  missingTitle: "Hindi namin kayang hanapin o gumawa ng dokumento para sa iyo.",
  missingBody:
    "Hilingin sa taong nag-book, sa airline, o sa travel agency na ipadala ito sa telepono mo.",

  helpOpen: "Kailangan ng tulong?",
  helpTitle: "Ano ang gagawin ko ngayon?",
  helpClose: "Naintindihan ko",
  helpLanguage: "I-tap ang kahon na may wika mo. Pagkatapos, i-tap ang butones sa ibaba.",
  helpGuide:
    "Basahin ang apat na maiikling hakbang. Pagkatapos, i-tap ang butones sa ibaba para pumili ng file.",
  helpFile:
    "Larawan ba ang ipi-print mo? I-tap ang “Buksan ang mga larawan ko”. PDF ba na naka-save? I-tap ang “Buksan ang mga file ko”. Isang file lang.",
  helpPreview:
    "Tingnan ang larawan. Kung tama, i-tap ang “I-print ang 1 kopya”. Kung mali, i-tap ang “Pumili ng ibang file”.",
  helpProgress:
    "Wala kang gagawin ngayon. Iwang bukas ang pahinang ito at maghintay. Malapit nang lumabas ang papel.",
  helpDone: "Nasa printer sa tabi ng malaking screen ang papel mo. Kunin na ito.",
  helpError: "Pumunta sa malaking screen, i-scan muli ang QR code, at magsimula muli.",
  helpAskStaff: "Hindi pa rin gumagana? Magtanong sa staff na malapit sa printer.",

  kioskScanTitle: "I-scan ang QR code na ito sa camera ng telepono mo",
  kioskNoWifi: "Hindi kailangan ng Wi-Fi — gamitin ang mobile data mo",
} satisfies Translation;

const vi = {
  brand: "Print-cess by Paradiso",

  selectLanguage: "Chọn ngôn ngữ của bạn",
  selectLanguageHint: "Nhấn vào ngôn ngữ của bạn. Rồi nhấn nút ở dưới.",
  step: "Bước {{current}} / {{total}}",
  continue: "Tiếp tục",

  guideTitle: "Cách in",
  guideIntro: "Chỉ bốn bước. Không cần ứng dụng, không cần đăng nhập.",
  guideScanTitle: "1. Quét mã QR",
  guideScanBody: "Bạn đã quét bằng camera điện thoại. Bước này xong rồi.",
  guideChooseTitle: "2. Chọn một tệp",
  guideChooseBody: "Một ảnh, hoặc một tệp PDF đã lưu trong điện thoại.",
  guideCheckTitle: "3. Xem lại, rồi in",
  guideCheckBody: "Xem hình trên điện thoại, rồi nhấn nút in.",
  guideCollectTitle: "4. Lấy giấy của bạn",
  guideCollectBody: "Máy in ở ngay cạnh màn hình lớn. Lấy giấy ở đó.",
  guideListen: "Nghe hướng dẫn",
  guideStart: "Chọn tệp của tôi",
  languageReminder: "Nhấn ngôn ngữ của bạn, rồi nhấn Tiếp tục.",
  guideReminder: "Đọc bốn bước, rồi nhấn nút ở dưới.",

  chooseFile: "Chọn một tệp để in",
  fileRules: "PDF, JPG hoặc PNG · tối đa 10 MB · tối đa 10 trang",
  locationPhotos: "Mở ảnh của tôi",
  locationFiles: "Mở tệp của tôi",
  cancelled: "Chưa có tệp nào. Nhấn một trong hai nút ở dưới.",

  checkDocument: "Đúng trang này không?",
  previewHelp: "Máy in sẽ in đúng như hình bên dưới. Hãy xem kỹ.",
  printSummary: "1 bản · giấy A4 · đen trắng · một mặt",
  privacySummary: "Tệp của bạn được khóa khi gửi đi, và bị xóa ngay sau khi in.",
  printOneCopy: "In 1 bản",
  chooseAnother: "Chọn tệp khác",

  encrypting: "Đang chuẩn bị tệp của bạn",
  uploading: "Đang gửi tệp của bạn",
  waitingForPrint: "Máy in sắp bắt đầu",
  completed: "Xong rồi",
  collectOutput: "Lấy giấy ở máy in.",
  listenAgain: "Nghe lại",
  keepPageOpen: "Đừng đóng trang này.",
  preparingSession: "Đang chuẩn bị…",

  documentPreview: "Xem trước tài liệu",
  selectedDocumentPreview: "Xem trước tệp bạn đã chọn",
  pdfPreview: "Xem trước PDF",
  firstPagePreview: "Xem trước trang đầu",

  invalidQr: "Liên kết này chưa đầy đủ. Hãy quét lại mã QR trên màn hình lớn.",
  expiredQr: "Mã QR này đã cũ. Hãy quét mã QR mới trên màn hình lớn.",
  usedQr: "Có người đang dùng mã QR này. Hãy quét mã mới trên màn hình lớn.",
  unsupportedType: "Chỉ in được PDF, JPG và PNG. Hãy lưu thành PDF, hoặc chụp ảnh màn hình rõ nét.",
  tooLarge: "Tệp này lớn hơn 10 MB. Chỉ lưu những trang cần, hoặc chụp ảnh màn hình.",
  tooManyPages: "Tệp PDF này nhiều hơn 10 trang. Chỉ lưu những trang bạn cần.",
  lockedPdf:
    "Tệp PDF này có mật khẩu. Hãy mở trên điện thoại và chụp ảnh màn hình những trang cần.",
  damagedFile: "Tệp này không mở được. Hãy lưu lại, hoặc chụp ảnh màn hình rõ nét.",
  fingerprintMismatch: "Không kiểm tra được kết nối này. Hãy quét lại mã QR trên màn hình lớn.",
  networkError: "Mất kết nối. Hãy kiểm tra dữ liệu di động, rồi quét lại mã QR.",

  chooseLocation: "Tệp của bạn ở đâu?",
  locationKakao: "Trong KakaoTalk",
  locationEmail: "Trong email",
  locationMissing: "Tôi không có tệp",
  kakaoGuide: "Mở tệp trong KakaoTalk, nhấn Chia sẻ, rồi lưu vào điện thoại. Sau đó quay lại đây.",
  emailGuide: "Mở tệp đính kèm email trên điện thoại và lưu lại. Sau đó quay lại đây.",
  missingTitle: "Chúng tôi không thể tìm hay tạo tài liệu cho bạn.",
  missingBody:
    "Hãy nhờ người đã đặt chỗ, hãng hàng không hoặc đại lý du lịch gửi tài liệu vào điện thoại của bạn.",

  helpOpen: "Cần giúp đỡ?",
  helpTitle: "Bây giờ tôi làm gì?",
  helpClose: "Đã hiểu",
  helpLanguage: "Nhấn vào ô có ngôn ngữ của bạn. Rồi nhấn nút ở dưới.",
  helpGuide: "Đọc bốn bước ngắn. Rồi nhấn nút ở dưới để chọn tệp.",
  helpFile:
    "Thứ bạn muốn in là ảnh? Nhấn “Mở ảnh của tôi”. Là tệp PDF đã lưu? Nhấn “Mở tệp của tôi”. Chỉ chọn một tệp.",
  helpPreview: "Xem hình. Nếu đúng, nhấn “In 1 bản”. Nếu sai, nhấn “Chọn tệp khác”.",
  helpProgress: "Bây giờ bạn không cần nhấn gì. Hãy để trang này mở và chờ. Giấy sẽ ra ngay.",
  helpDone: "Giấy của bạn ở máy in cạnh màn hình lớn. Hãy lấy đi.",
  helpError: "Hãy đến màn hình lớn, quét lại mã QR và làm lại từ đầu.",
  helpAskStaff: "Vẫn không được? Hãy hỏi nhân viên ở gần máy in.",

  kioskScanTitle: "Quét mã QR này bằng camera điện thoại",
  kioskNoWifi: "Không cần Wi-Fi — dùng dữ liệu di động",
} satisfies Translation;

const th = {
  brand: "Print-cess by Paradiso",

  selectLanguage: "เลือกภาษาของคุณ",
  selectLanguageHint: "แตะภาษาของคุณ แล้วแตะปุ่มด้านล่าง",
  step: "ขั้นที่ {{current}} จาก {{total}}",
  continue: "ต่อไป",

  guideTitle: "วิธีพิมพ์",
  guideIntro: "มีแค่สี่ขั้น ไม่ต้องลงแอป ไม่ต้องเข้าสู่ระบบ",
  guideScanTitle: "1. สแกนคิวอาร์โค้ด",
  guideScanBody: "คุณสแกนด้วยกล้องมือถือแล้ว ขั้นนี้เสร็จแล้ว",
  guideChooseTitle: "2. เลือกไฟล์หนึ่งไฟล์",
  guideChooseBody: "รูปหนึ่งรูป หรือไฟล์ PDF หนึ่งไฟล์ที่เก็บไว้ในมือถือ",
  guideCheckTitle: "3. ดูให้ชัด แล้วสั่งพิมพ์",
  guideCheckBody: "ดูรูปบนมือถือ แล้วแตะปุ่มพิมพ์",
  guideCollectTitle: "4. รับกระดาษของคุณ",
  guideCollectBody: "เครื่องพิมพ์อยู่ข้างจอใหญ่ ไปรับกระดาษที่นั่น",
  guideListen: "ฟังคำอธิบาย",
  guideStart: "เลือกไฟล์ของฉัน",
  languageReminder: "แตะภาษาของคุณ แล้วแตะ ต่อไป",
  guideReminder: "อ่านสี่ขั้นนี้ แล้วแตะปุ่มด้านล่าง",

  chooseFile: "เลือกไฟล์ที่จะพิมพ์หนึ่งไฟล์",
  fileRules: "PDF, JPG หรือ PNG · ไม่เกิน 10 MB · ไม่เกิน 10 หน้า",
  locationPhotos: "เปิดรูปของฉัน",
  locationFiles: "เปิดไฟล์ของฉัน",
  cancelled: "ยังไม่ได้เลือกไฟล์ แตะปุ่มใดปุ่มหนึ่งด้านล่าง",

  checkDocument: "หน้านี้ถูกไหม?",
  previewHelp: "เครื่องจะพิมพ์ตามที่คุณเห็นด้านล่างนี้ ดูให้ดีก่อน",
  printSummary: "1 ชุด · กระดาษ A4 · ขาวดำ · หน้าเดียว",
  privacySummary: "ไฟล์ของคุณถูกล็อกตอนส่ง และลบทิ้งทันทีหลังพิมพ์เสร็จ",
  printOneCopy: "พิมพ์ 1 ชุด",
  chooseAnother: "เลือกไฟล์อื่น",

  encrypting: "กำลังเตรียมไฟล์ของคุณ",
  uploading: "กำลังส่งไฟล์ของคุณ",
  waitingForPrint: "เครื่องพิมพ์กำลังจะเริ่ม",
  completed: "เสร็จแล้ว",
  collectOutput: "รับกระดาษที่เครื่องพิมพ์",
  listenAgain: "ฟังอีกครั้ง",
  keepPageOpen: "อย่าปิดหน้านี้",
  preparingSession: "กำลังเตรียม…",

  documentPreview: "ตัวอย่างเอกสาร",
  selectedDocumentPreview: "ตัวอย่างไฟล์ที่คุณเลือก",
  pdfPreview: "ตัวอย่าง PDF",
  firstPagePreview: "ตัวอย่างหน้าแรก",

  invalidQr: "ลิงก์นี้ไม่ครบ สแกนคิวอาร์โค้ดบนจอใหญ่อีกครั้ง",
  expiredQr: "คิวอาร์โค้ดนี้เก่าเกินไป สแกนคิวอาร์โค้ดใหม่บนจอใหญ่",
  usedQr: "มีคนใช้คิวอาร์โค้ดนี้อยู่ สแกนอันใหม่บนจอใหญ่",
  unsupportedType: "พิมพ์ได้เฉพาะ PDF, JPG และ PNG บันทึกเป็น PDF หรือถ่ายภาพหน้าจอให้ชัด",
  tooLarge: "ไฟล์นี้ใหญ่กว่า 10 MB เก็บเฉพาะหน้าที่ต้องการ หรือถ่ายภาพหน้าจอ",
  tooManyPages: "PDF นี้มากกว่า 10 หน้า เก็บเฉพาะหน้าที่คุณต้องการ",
  lockedPdf: "PDF นี้มีรหัสผ่าน เปิดในมือถือแล้วถ่ายภาพหน้าจอหน้าที่ต้องการ",
  damagedFile: "ไฟล์นี้เปิดไม่ได้ บันทึกใหม่ หรือถ่ายภาพหน้าจอให้ชัด",
  fingerprintMismatch: "ตรวจสอบการเชื่อมต่อนี้ไม่ได้ สแกนคิวอาร์โค้ดบนจอใหญ่อีกครั้ง",
  networkError: "การเชื่อมต่อหลุด ตรวจอินเทอร์เน็ตมือถือ แล้วสแกนคิวอาร์โค้ดอีกครั้ง",

  chooseLocation: "ไฟล์ของคุณอยู่ที่ไหน?",
  locationKakao: "อยู่ใน KakaoTalk",
  locationEmail: "อยู่ในอีเมล",
  locationMissing: "ฉันไม่มีไฟล์",
  kakaoGuide: "เปิดไฟล์ใน KakaoTalk แตะแชร์ แล้วบันทึกลงมือถือ จากนั้นกลับมาที่หน้านี้",
  emailGuide: "เปิดไฟล์แนบในอีเมลบนมือถือแล้วบันทึก จากนั้นกลับมาที่หน้านี้",
  missingTitle: "เราหาเอกสารให้คุณไม่ได้ และออกเอกสารใหม่ให้ไม่ได้",
  missingBody: "ขอให้คนที่จองให้ สายการบิน หรือบริษัททัวร์ ส่งเอกสารมาที่มือถือของคุณ",

  helpOpen: "ต้องการความช่วยเหลือ",
  helpTitle: "ตอนนี้ต้องทำอะไร?",
  helpClose: "เข้าใจแล้ว",
  helpLanguage: "แตะช่องที่มีภาษาของคุณ แล้วแตะปุ่มด้านล่าง",
  helpGuide: "อ่านสี่ขั้นสั้น ๆ แล้วแตะปุ่มด้านล่างเพื่อเลือกไฟล์",
  helpFile:
    "สิ่งที่จะพิมพ์เป็นรูปไหม แตะ “เปิดรูปของฉัน” เป็น PDF ที่บันทึกไว้ไหม แตะ “เปิดไฟล์ของฉัน” เลือกได้ไฟล์เดียว",
  helpPreview: "ดูรูป ถ้าถูกแล้วแตะ “พิมพ์ 1 ชุด” ถ้าผิดแตะ “เลือกไฟล์อื่น”",
  helpProgress: "ตอนนี้ไม่ต้องกดอะไร เปิดหน้านี้ไว้และรอ กระดาษจะออกมาเร็ว ๆ นี้",
  helpDone: "กระดาษของคุณอยู่ที่เครื่องพิมพ์ข้างจอใหญ่ ไปรับได้เลย",
  helpError: "ไปที่จอใหญ่ สแกนคิวอาร์โค้ดอีกครั้ง แล้วเริ่มใหม่",
  helpAskStaff: "ยังไม่ได้อยู่ไหม ขอให้เจ้าหน้าที่ใกล้เครื่องพิมพ์ช่วย",

  kioskScanTitle: "สแกนคิวอาร์โค้ดนี้ด้วยกล้องมือถือ",
  kioskNoWifi: "ไม่ต้องใช้ Wi-Fi — ใช้อินเทอร์เน็ตมือถือได้เลย",
} satisfies Translation;

const ne = {
  brand: "Print-cess by Paradiso",

  selectLanguage: "आफ्नो भाषा छान्नुहोस्",
  selectLanguageHint: "आफ्नो भाषामा थिच्नुहोस्। त्यसपछि तलको बटन थिच्नुहोस्।",
  step: "{{total}} मध्ये {{current}} चरण",
  continue: "अगाडि बढ्नुहोस्",

  guideTitle: "कसरी प्रिन्ट गर्ने",
  guideIntro: "चार चरण मात्र। कुनै एप वा खाता चाहिँदैन।",
  guideScanTitle: "1. QR कोड स्क्यान गर्नुहोस्",
  guideScanBody: "तपाईंले फोनको क्यामेराले स्क्यान गर्नुभयो। यो चरण सकियो।",
  guideChooseTitle: "2. एउटा फाइल छान्नुहोस्",
  guideChooseBody: "एउटा फोटो, वा फोनमा राखेको एउटा PDF।",
  guideCheckTitle: "3. हेर्नुहोस्, त्यसपछि प्रिन्ट गर्नुहोस्",
  guideCheckBody: "फोनमा देखिने चित्र हेर्नुहोस्, त्यसपछि प्रिन्ट बटन थिच्नुहोस्।",
  guideCollectTitle: "4. आफ्नो कागज लिनुहोस्",
  guideCollectBody: "प्रिन्टर ठूलो पर्दाको छेउमा छ। कागज त्यहीँ लिनुहोस्।",
  guideListen: "चरणहरू सुन्नुहोस्",
  guideStart: "मेरो फाइल छान्नुहोस्",
  languageReminder: "आफ्नो भाषा थिच्नुहोस्, त्यसपछि ‘अगाडि बढ्नुहोस्’ थिच्नुहोस्।",
  guideReminder: "चारै चरण पढ्नुहोस्, त्यसपछि तलको बटन थिच्नुहोस्।",

  chooseFile: "प्रिन्ट गर्न एउटा फाइल छान्नुहोस्",
  fileRules: "PDF, JPG वा PNG · 10 MB सम्म · 10 पृष्ठसम्म",
  locationPhotos: "मेरो फोटो खोल्नुहोस्",
  locationFiles: "मेरो फाइल खोल्नुहोस्",
  cancelled: "अझै फाइल छानिएको छैन। तलका दुई बटनमध्ये एउटा थिच्नुहोस्।",

  checkDocument: "यही पृष्ठ ठीक छ?",
  previewHelp: "तल देखिएको जस्तै प्रिन्ट हुन्छ। राम्ररी हेर्नुहोस्।",
  printSummary: "1 प्रति · A4 कागज · कालो-सेतो · एकतर्फी",
  privacySummary: "तपाईंको फाइल पठाउँदा बन्द हुन्छ, र प्रिन्ट भएपछि तुरुन्तै मेटिन्छ।",
  printOneCopy: "1 प्रति प्रिन्ट गर्नुहोस्",
  chooseAnother: "अर्को फाइल छान्नुहोस्",

  encrypting: "तपाईंको फाइल तयार गर्दै",
  uploading: "तपाईंको फाइल पठाउँदै",
  waitingForPrint: "प्रिन्टर सुरु हुँदै छ",
  completed: "सबै सकियो",
  collectOutput: "प्रिन्टरबाट कागज लिनुहोस्।",
  listenAgain: "फेरि सुन्नुहोस्",
  keepPageOpen: "यो पृष्ठ बन्द नगर्नुहोस्।",
  preparingSession: "तयारी हुँदै छ…",

  documentPreview: "कागजात पूर्वावलोकन",
  selectedDocumentPreview: "तपाईंले छानेको फाइलको पूर्वावलोकन",
  pdfPreview: "PDF पूर्वावलोकन",
  firstPagePreview: "पहिलो पृष्ठको पूर्वावलोकन",

  invalidQr: "यो लिंक पूरा छैन। ठूलो पर्दाको QR कोड फेरि स्क्यान गर्नुहोस्।",
  expiredQr: "यो QR कोड धेरै पुरानो भयो। ठूलो पर्दाको नयाँ QR कोड स्क्यान गर्नुहोस्।",
  usedQr: "यो QR कोड कसैले प्रयोग गर्दै छ। ठूलो पर्दाको नयाँ कोड स्क्यान गर्नुहोस्।",
  unsupportedType:
    "PDF, JPG र PNG मात्र प्रिन्ट हुन्छ। PDF बनाएर राख्नुहोस्, वा स्पष्ट स्क्रिनसट लिनुहोस्।",
  tooLarge: "यो फाइल 10 MB भन्दा ठूलो छ। चाहिने पृष्ठ मात्र राख्नुहोस्, वा स्क्रिनसट लिनुहोस्।",
  tooManyPages: "यो PDF मा 10 भन्दा बढी पृष्ठ छन्। चाहिने पृष्ठ मात्र राख्नुहोस्।",
  lockedPdf: "यो PDF मा पासवर्ड छ। फोनमा खोलेर चाहिने पृष्ठको स्क्रिनसट लिनुहोस्।",
  damagedFile: "यो फाइल खुल्दैन। फेरि सेभ गर्नुहोस्, वा स्पष्ट स्क्रिनसट लिनुहोस्।",
  fingerprintMismatch: "यो जडान जाँच्न सकिएन। ठूलो पर्दाको QR कोड फेरि स्क्यान गर्नुहोस्।",
  networkError: "जडान टुट्यो। मोबाइल डाटा जाँच्नुहोस्, त्यसपछि QR कोड फेरि स्क्यान गर्नुहोस्।",

  chooseLocation: "तपाईंको फाइल कहाँ छ?",
  locationKakao: "KakaoTalk मा",
  locationEmail: "इमेलमा",
  locationMissing: "मसँग फाइल छैन",
  kakaoGuide:
    "KakaoTalk मा फाइल खोल्नुहोस्, Share थिच्नुहोस्, र फोनमा सेभ गर्नुहोस्। त्यसपछि यहाँ फर्किनुहोस्।",
  emailGuide: "फोनमा इमेलको संलग्न फाइल खोलेर सेभ गर्नुहोस्। त्यसपछि यहाँ फर्किनुहोस्।",
  missingTitle: "हामी तपाईंको कागजात खोज्न वा नयाँ बनाउन सक्दैनौँ।",
  missingBody:
    "बुकिङ गर्ने व्यक्ति, एयरलाइन वा ट्राभल एजेन्सीलाई फोनमा कागजात पठाउन अनुरोध गर्नुहोस्।",

  helpOpen: "सहयोग चाहियो?",
  helpTitle: "अब मैले के गर्ने?",
  helpClose: "बुझेँ",
  helpLanguage: "आफ्नो भाषा लेखिएको बाकसमा थिच्नुहोस्। त्यसपछि तलको बटन थिच्नुहोस्।",
  helpGuide: "छोटा चार चरण पढ्नुहोस्। त्यसपछि फाइल छान्न तलको बटन थिच्नुहोस्।",
  helpFile:
    "प्रिन्ट गर्ने चीज फोटो हो? ‘मेरो फोटो खोल्नुहोस्’ थिच्नुहोस्। सेभ गरेको PDF हो? ‘मेरो फाइल खोल्नुहोस्’ थिच्नुहोस्। एउटै फाइल छान्नुहोस्।",
  helpPreview:
    "चित्र हेर्नुहोस्। ठीक छ भने ‘1 प्रति प्रिन्ट गर्नुहोस्’ थिच्नुहोस्। ठीक छैन भने ‘अर्को फाइल छान्नुहोस्’ थिच्नुहोस्।",
  helpProgress: "अहिले केही थिच्नु पर्दैन। यो पृष्ठ खुला राखी पर्खनुहोस्। कागज चाँडै निस्किन्छ।",
  helpDone: "तपाईंको कागज ठूलो पर्दाको छेउको प्रिन्टरमा छ। लिएर जानुहोस्।",
  helpError: "ठूलो पर्दामा जानुहोस्, QR कोड फेरि स्क्यान गर्नुहोस्, र सुरुदेखि गर्नुहोस्।",
  helpAskStaff: "अझै नमिले प्रिन्टरनजिकको कर्मचारीलाई सोध्नुहोस्।",

  kioskScanTitle: "फोनको क्यामेराले यो QR कोड स्क्यान गर्नुहोस्",
  kioskNoWifi: "Wi-Fi चाहिँदैन — मोबाइल डाटा प्रयोग गर्नुहोस्",
} satisfies Translation;

const km = {
  brand: "Print-cess by Paradiso",

  selectLanguage: "ជ្រើសរើសភាសារបស់អ្នក",
  selectLanguageHint: "ចុចលើភាសារបស់អ្នក។ បន្ទាប់មកចុចប៊ូតុងខាងក្រោម។",
  step: "ជំហានទី {{current}} នៃ {{total}}",
  continue: "បន្ត",

  guideTitle: "របៀបបោះពុម្ព",
  guideIntro: "មានតែ ៤ ជំហាន។ មិនត្រូវការកម្មវិធី ឬគណនីទេ។",
  guideScanTitle: "1. ស្កេនកូដ QR",
  guideScanBody: "អ្នកបានស្កេនដោយកាមេរ៉ាទូរស័ព្ទរួចហើយ។ ជំហាននេះចប់។",
  guideChooseTitle: "2. ជ្រើសឯកសារមួយ",
  guideChooseBody: "រូបថតមួយ ឬឯកសារ PDF មួយដែលរក្សាទុកក្នុងទូរស័ព្ទ។",
  guideCheckTitle: "3. ពិនិត្យ ហើយបោះពុម្ព",
  guideCheckBody: "មើលរូបនៅលើទូរស័ព្ទ ហើយចុចប៊ូតុងបោះពុម្ព។",
  guideCollectTitle: "4. យកក្រដាសរបស់អ្នក",
  guideCollectBody: "ម៉ាស៊ីនបោះពុម្ពនៅជាប់អេក្រង់ធំ។ យកក្រដាសនៅទីនោះ។",
  guideListen: "ស្តាប់ជំហានទាំងនេះ",
  guideStart: "ជ្រើសឯកសាររបស់ខ្ញុំ",
  languageReminder: "ចុចភាសារបស់អ្នក រួចចុច បន្ត។",
  guideReminder: "អានជំហានទាំង ៤ រួចចុចប៊ូតុងខាងក្រោម។",

  chooseFile: "ជ្រើសឯកសារមួយដើម្បីបោះពុម្ព",
  fileRules: "PDF, JPG ឬ PNG · មិនលើស 10 MB · មិនលើស 10 ទំព័រ",
  locationPhotos: "បើករូបថតរបស់ខ្ញុំ",
  locationFiles: "បើកឯកសាររបស់ខ្ញុំ",
  cancelled: "មិនទាន់មានឯកសារទេ។ ចុចប៊ូតុងមួយក្នុងចំណោមពីរខាងក្រោម។",

  checkDocument: "ទំព័រនេះត្រូវទេ?",
  previewHelp: "ម៉ាស៊ីននឹងបោះពុម្ពដូចអ្វីដែលអ្នកឃើញខាងក្រោមនេះ។ សូមមើលឱ្យបានច្បាស់។",
  printSummary: "១ ច្បាប់ · ក្រដាស A4 · សខ្មៅ · ម្ខាង",
  privacySummary: "ឯកសាររបស់អ្នកត្រូវបានចាក់សោពេលផ្ញើ ហើយលុបចោលភ្លាមបន្ទាប់ពីបោះពុម្ព។",
  printOneCopy: "បោះពុម្ព ១ ច្បាប់",
  chooseAnother: "ជ្រើសឯកសារផ្សេង",

  encrypting: "កំពុងរៀបចំឯកសាររបស់អ្នក",
  uploading: "កំពុងផ្ញើឯកសាររបស់អ្នក",
  waitingForPrint: "ម៉ាស៊ីនបោះពុម្ពនឹងចាប់ផ្តើម",
  completed: "រួចរាល់ហើយ",
  collectOutput: "យកក្រដាសពីម៉ាស៊ីនបោះពុម្ព។",
  listenAgain: "ស្តាប់ម្តងទៀត",
  keepPageOpen: "សូមមិនបិទទំព័រនេះ។",
  preparingSession: "កំពុងរៀបចំ…",

  documentPreview: "មើលឯកសារជាមុន",
  selectedDocumentPreview: "មើលឯកសារដែលអ្នកបានជ្រើស",
  pdfPreview: "មើល PDF ជាមុន",
  firstPagePreview: "មើលទំព័រដំបូងជាមុន",

  invalidQr: "តំណនេះមិនពេញលេញ។ ស្កេនកូដ QR លើអេក្រង់ធំម្តងទៀត។",
  expiredQr: "កូដ QR នេះចាស់ពេកហើយ។ ស្កេនកូដ QR ថ្មីលើអេក្រង់ធំ។",
  usedQr: "មានគេកំពុងប្រើកូដ QR នេះ។ ស្កេនកូដថ្មីលើអេក្រង់ធំ។",
  unsupportedType: "បោះពុម្ពបានតែ PDF, JPG និង PNG។ រក្សាទុកជា PDF ឬថតអេក្រង់ឱ្យច្បាស់។",
  tooLarge: "ឯកសារនេះធំជាង 10 MB។ រក្សាទុកតែទំព័រដែលត្រូវការ ឬថតអេក្រង់។",
  tooManyPages: "PDF នេះលើស 10 ទំព័រ។ រក្សាទុកតែទំព័រដែលអ្នកត្រូវការ។",
  lockedPdf: "PDF នេះមានពាក្យសម្ងាត់។ បើកក្នុងទូរស័ព្ទ ហើយថតអេក្រង់ទំព័រដែលត្រូវការ។",
  damagedFile: "ឯកសារនេះបើកមិនបាន។ រក្សាទុកម្តងទៀត ឬថតអេក្រង់ឱ្យច្បាស់។",
  fingerprintMismatch: "មិនអាចពិនិត្យការតភ្ជាប់នេះបានទេ។ ស្កេនកូដ QR លើអេក្រង់ធំម្តងទៀត។",
  networkError: "ការតភ្ជាប់បានដាច់។ ពិនិត្យទិន្នន័យទូរស័ព្ទ រួចស្កេនកូដ QR ម្តងទៀត។",

  chooseLocation: "ឯកសាររបស់អ្នកនៅឯណា?",
  locationKakao: "ក្នុង KakaoTalk",
  locationEmail: "ក្នុងអ៊ីមែល",
  locationMissing: "ខ្ញុំមិនមានឯកសារ",
  kakaoGuide:
    "បើកឯកសារក្នុង KakaoTalk ចុច ចែករំលែក ហើយរក្សាទុកក្នុងទូរស័ព្ទ។ បន្ទាប់មកត្រឡប់មកទំព័រនេះ។",
  emailGuide: "បើកឯកសារភ្ជាប់អ៊ីមែលក្នុងទូរស័ព្ទ ហើយរក្សាទុក។ បន្ទាប់មកត្រឡប់មកទំព័រនេះ។",
  missingTitle: "យើងមិនអាចរកឯកសារ ឬបង្កើតឯកសារថ្មីជំនួសអ្នកបានទេ។",
  missingBody: "សូមស្នើអ្នកកក់ ក្រុមហ៊ុនអាកាសចរណ៍ ឬភ្នាក់ងារទេសចរណ៍ ផ្ញើឯកសារមកទូរស័ព្ទរបស់អ្នក។",

  helpOpen: "ត្រូវការជំនួយ?",
  helpTitle: "ឥឡូវនេះខ្ញុំគួរធ្វើអ្វី?",
  helpClose: "យល់ហើយ",
  helpLanguage: "ចុចប្រអប់ដែលមានភាសារបស់អ្នក។ បន្ទាប់មកចុចប៊ូតុងខាងក្រោម។",
  helpGuide: "អានជំហានខ្លីទាំង ៤។ បន្ទាប់មកចុចប៊ូតុងខាងក្រោមដើម្បីជ្រើសឯកសារ។",
  helpFile:
    "អ្វីដែលអ្នកចង់បោះពុម្ពជារូបថតឬ? ចុច “បើករូបថតរបស់ខ្ញុំ”។ ជា PDF ដែលរក្សាទុករួចឬ? ចុច “បើកឯកសាររបស់ខ្ញុំ”។ ជ្រើសបានតែមួយ។",
  helpPreview: "មើលរូប។ ប្រសិនបើត្រូវ ចុច “បោះពុម្ព ១ ច្បាប់”។ ប្រសិនបើខុស ចុច “ជ្រើសឯកសារផ្សេង”។",
  helpProgress: "ឥឡូវនេះមិនត្រូវចុចអ្វីទេ។ ទុកទំព័រនេះឱ្យបើក ហើយរង់ចាំ។ ក្រដាសនឹងចេញមកឆាប់ៗ។",
  helpDone: "ក្រដាសរបស់អ្នកនៅម៉ាស៊ីនបោះពុម្ពជាប់អេក្រង់ធំ។ សូមយកទៅ។",
  helpError: "ទៅអេក្រង់ធំ ស្កេនកូដ QR ម្តងទៀត ហើយចាប់ផ្តើមឡើងវិញ។",
  helpAskStaff: "នៅតែមិនបាន? សូមសួរបុគ្គលិកនៅជិតម៉ាស៊ីនបោះពុម្ព។",

  kioskScanTitle: "ស្កេនកូដ QR នេះដោយកាមេរ៉ាទូរស័ព្ទ",
  kioskNoWifi: "មិនត្រូវការ Wi-Fi — ប្រើទិន្នន័យទូរស័ព្ទ",
} satisfies Translation;

const ar = {
  brand: "Print-cess by Paradiso",

  selectLanguage: "اختر لغتك",
  selectLanguageHint: "اضغط على لغتك، ثم اضغط الزر في الأسفل.",
  step: "الخطوة {{current}} من {{total}}",
  continue: "متابعة",

  guideTitle: "كيف تطبع",
  guideIntro: "أربع خطوات فقط. لا تحتاج تطبيقًا ولا حسابًا.",
  guideScanTitle: "1. امسح رمز QR",
  guideScanBody: "مسحته بكاميرا هاتفك. انتهت هذه الخطوة.",
  guideChooseTitle: "2. اختر ملفًا واحدًا",
  guideChooseBody: "صورة واحدة، أو ملف PDF واحد محفوظ في هاتفك.",
  guideCheckTitle: "3. تحقّق ثم اطبع",
  guideCheckBody: "انظر إلى الصورة على هاتفك، ثم اضغط زر الطباعة.",
  guideCollectTitle: "4. خذ ورقتك",
  guideCollectBody: "الطابعة بجانب الشاشة الكبيرة. خذ ورقتك من هناك.",
  guideListen: "اسمع الخطوات",
  guideStart: "اختيار ملفي",
  languageReminder: "اضغط على لغتك، ثم اضغط متابعة.",
  guideReminder: "اقرأ الخطوات الأربع، ثم اضغط الزر في الأسفل.",

  chooseFile: "اختر ملفًا واحدًا للطباعة",
  fileRules: "PDF أو JPG أو PNG · حتى 10 MB · حتى 10 صفحات",
  locationPhotos: "افتح صوري",
  locationFiles: "افتح ملفاتي",
  cancelled: "لا يوجد ملف بعد. اضغط أحد الزرين في الأسفل.",

  checkDocument: "هل هذه الصفحة الصحيحة؟",
  previewHelp: "ستطبع الطابعة ما تراه في الأسفل بالضبط. انظر إليه بتمعّن.",
  printSummary: "نسخة واحدة · ورق A4 · أبيض وأسود · وجه واحد",
  privacySummary: "ملفك مقفل أثناء إرساله، ويُحذف مباشرة بعد الطباعة.",
  printOneCopy: "اطبع نسخة واحدة",
  chooseAnother: "اختر ملفًا آخر",

  encrypting: "نُحضّر ملفك",
  uploading: "نُرسل ملفك",
  waitingForPrint: "الطابعة على وشك البدء",
  completed: "تم كل شيء",
  collectOutput: "خذ ورقتك من الطابعة.",
  listenAgain: "اسمع مرة أخرى",
  keepPageOpen: "لا تغلق هذه الصفحة.",
  preparingSession: "جارٍ التحضير…",

  documentPreview: "معاينة المستند",
  selectedDocumentPreview: "معاينة الملف الذي اخترته",
  pdfPreview: "معاينة PDF",
  firstPagePreview: "معاينة الصفحة الأولى",

  invalidQr: "هذا الرابط غير مكتمل. امسح رمز QR على الشاشة الكبيرة مرة أخرى.",
  expiredQr: "رمز QR هذا قديم. امسح رمز QR الجديد على الشاشة الكبيرة.",
  usedQr: "هناك شخص يستخدم رمز QR هذا. امسح الرمز الجديد على الشاشة الكبيرة.",
  unsupportedType: "يمكن طباعة PDF وJPG وPNG فقط. احفظ صفحتك بصيغة PDF، أو التقط صورة شاشة واضحة.",
  tooLarge: "حجم هذا الملف أكبر من 10 MB. احفظ الصفحات التي تحتاجها فقط، أو التقط صورة شاشة.",
  tooManyPages: "ملف PDF هذا أكثر من 10 صفحات. احفظ الصفحات التي تحتاجها فقط.",
  lockedPdf: "ملف PDF هذا محمي بكلمة مرور. افتحه على هاتفك والتقط صورة شاشة للصفحات التي تحتاجها.",
  damagedFile: "هذا الملف لا يُفتح. احفظه مرة أخرى، أو التقط صورة شاشة واضحة.",
  fingerprintMismatch:
    "لم نتمكّن من التحقّق من هذا الاتصال. امسح رمز QR على الشاشة الكبيرة مرة أخرى.",
  networkError: "انقطع الاتصال. تحقّق من بيانات هاتفك، ثم امسح رمز QR مرة أخرى.",

  chooseLocation: "أين ملفك؟",
  locationKakao: "في KakaoTalk",
  locationEmail: "في البريد الإلكتروني",
  locationMissing: "ليس لدي الملف",
  kakaoGuide: "افتح الملف في KakaoTalk، اضغط مشاركة، واحفظه في هاتفك. ثم عد إلى هنا.",
  emailGuide: "افتح مرفق البريد الإلكتروني على هاتفك واحفظه. ثم عد إلى هنا.",
  missingTitle: "لا نستطيع البحث عن مستند لك ولا إصدار مستند جديد.",
  missingBody: "اطلب من صاحب الحجز أو شركة الطيران أو وكالة السفر إرساله إلى هاتفك.",

  helpOpen: "تحتاج مساعدة؟",
  helpTitle: "ماذا أفعل الآن؟",
  helpClose: "فهمت",
  helpLanguage: "اضغط على المربّع الذي فيه لغتك. ثم اضغط الزر في الأسفل.",
  helpGuide: "اقرأ الخطوات الأربع القصيرة. ثم اضغط الزر في الأسفل لاختيار ملفك.",
  helpFile:
    "هل ما تريد طباعته صورة؟ اضغط «افتح صوري». هل هو ملف PDF محفوظ؟ اضغط «افتح ملفاتي». اختر ملفًا واحدًا فقط.",
  helpPreview:
    "انظر إلى الصورة. إن كانت الصفحة صحيحة، اضغط «اطبع نسخة واحدة». وإن كانت خطأ، اضغط «اختر ملفًا آخر».",
  helpProgress: "لا شيء عليك الآن. اترك هذه الصفحة مفتوحة وانتظر. ستخرج ورقتك قريبًا.",
  helpDone: "ورقتك في الطابعة بجانب الشاشة الكبيرة. خذها معك.",
  helpError: "اذهب إلى الشاشة الكبيرة، وامسح رمز QR مرة أخرى، وابدأ من جديد.",
  helpAskStaff: "ما زال الأمر صعبًا؟ اسأل أحد الموظفين قرب الطابعة.",

  kioskScanTitle: "امسح رمز QR هذا بكاميرا هاتفك",
  kioskNoWifi: "لا حاجة إلى Wi-Fi — استخدم بيانات هاتفك",
} satisfies Translation;

const ru = {
  brand: "Print-cess by Paradiso",

  selectLanguage: "Выберите язык",
  selectLanguageHint: "Нажмите на свой язык. Затем нажмите кнопку внизу.",
  step: "Шаг {{current}} из {{total}}",
  continue: "Продолжить",

  guideTitle: "Как напечатать",
  guideIntro: "Всего четыре шага. Приложение и аккаунт не нужны.",
  guideScanTitle: "1. Отсканируйте QR-код",
  guideScanBody: "Вы отсканировали его камерой телефона. Этот шаг сделан.",
  guideChooseTitle: "2. Выберите один файл",
  guideChooseBody: "Одно фото или один PDF, сохранённый в телефоне.",
  guideCheckTitle: "3. Проверьте и печатайте",
  guideCheckBody: "Посмотрите на картинку в телефоне и нажмите кнопку печати.",
  guideCollectTitle: "4. Заберите свой лист",
  guideCollectBody: "Принтер стоит рядом с большим экраном. Забирайте лист там.",
  guideListen: "Прослушать шаги",
  guideStart: "Выбрать файл",
  languageReminder: "Нажмите свой язык, затем нажмите «Продолжить».",
  guideReminder: "Прочитайте четыре шага, затем нажмите кнопку внизу.",

  chooseFile: "Выберите один файл для печати",
  fileRules: "PDF, JPG или PNG · до 10 МБ · до 10 страниц",
  locationPhotos: "Открыть мои фото",
  locationFiles: "Открыть мои файлы",
  cancelled: "Файл ещё не выбран. Нажмите одну из двух кнопок ниже.",

  checkDocument: "Это нужная страница?",
  previewHelp: "Принтер напечатает ровно то, что вы видите ниже. Посмотрите внимательно.",
  printSummary: "1 копия · бумага A4 · чёрно-белая · одна сторона",
  privacySummary: "Ваш файл закрыт, пока идёт передача, и удаляется сразу после печати.",
  printOneCopy: "Напечатать 1 копию",
  chooseAnother: "Выбрать другой файл",

  encrypting: "Готовим ваш файл",
  uploading: "Отправляем ваш файл",
  waitingForPrint: "Принтер сейчас начнёт",
  completed: "Готово",
  collectOutput: "Заберите лист из принтера.",
  listenAgain: "Прослушать ещё раз",
  keepPageOpen: "Не закрывайте эту страницу.",
  preparingSession: "Готовимся…",

  documentPreview: "Предпросмотр документа",
  selectedDocumentPreview: "Предпросмотр выбранного файла",
  pdfPreview: "Предпросмотр PDF",
  firstPagePreview: "Предпросмотр первой страницы",

  invalidQr: "Эта ссылка неполная. Отсканируйте QR-код на большом экране ещё раз.",
  expiredQr: "Этот QR-код устарел. Отсканируйте новый QR-код на большом экране.",
  usedQr: "Этим QR-кодом уже пользуются. Отсканируйте новый на большом экране.",
  unsupportedType:
    "Печатаются только PDF, JPG и PNG. Сохраните страницу как PDF или сделайте чёткий снимок экрана.",
  tooLarge: "Этот файл больше 10 МБ. Сохраните только нужные страницы или сделайте снимок экрана.",
  tooManyPages: "В этом PDF больше 10 страниц. Сохраните только нужные страницы.",
  lockedPdf: "У этого PDF есть пароль. Откройте его на телефоне и снимите нужные страницы.",
  damagedFile: "Этот файл не открывается. Сохраните его снова или сделайте чёткий снимок экрана.",
  fingerprintMismatch:
    "Не удалось проверить это соединение. Отсканируйте QR-код на большом экране ещё раз.",
  networkError: "Соединение прервалось. Проверьте мобильный интернет и отсканируйте QR-код снова.",

  chooseLocation: "Где ваш файл?",
  locationKakao: "В KakaoTalk",
  locationEmail: "В электронной почте",
  locationMissing: "У меня нет файла",
  kakaoGuide:
    "Откройте файл в KakaoTalk, нажмите «Поделиться» и сохраните его в телефон. Затем вернитесь сюда.",
  emailGuide: "Откройте вложение из письма на телефоне и сохраните его. Затем вернитесь сюда.",
  missingTitle: "Мы не можем найти ваш документ и не можем выдать новый.",
  missingBody:
    "Попросите того, кто оформлял бронирование, авиакомпанию или турагентство отправить документ на ваш телефон.",

  helpOpen: "Нужна помощь?",
  helpTitle: "Что делать сейчас?",
  helpClose: "Понятно",
  helpLanguage: "Нажмите на клетку со своим языком. Затем нажмите кнопку внизу.",
  helpGuide: "Прочитайте четыре коротких шага. Затем нажмите кнопку внизу, чтобы выбрать файл.",
  helpFile:
    "Нужно напечатать фото? Нажмите «Открыть мои фото». Это сохранённый PDF? Нажмите «Открыть мои файлы». Выберите только один файл.",
  helpPreview:
    "Посмотрите на картинку. Если страница нужная, нажмите «Напечатать 1 копию». Если нет — «Выбрать другой файл».",
  helpProgress:
    "Сейчас ничего нажимать не нужно. Держите страницу открытой и подождите. Лист скоро выйдет.",
  helpDone: "Ваш лист в принтере рядом с большим экраном. Забирайте его.",
  helpError: "Подойдите к большому экрану, отсканируйте QR-код заново и начните сначала.",
  helpAskStaff: "Всё равно не получается? Попросите помощи у сотрудника рядом с принтером.",

  kioskScanTitle: "Отсканируйте этот QR-код камерой телефона",
  kioskNoWifi: "Wi-Fi не нужен — используйте мобильный интернет",
} satisfies Translation;

const mn = {
  brand: "Print-cess by Paradiso",

  selectLanguage: "Хэлээ сонгоно уу",
  selectLanguageHint: "Хэлээ дарна уу. Дараа нь доод товчийг дарна уу.",
  step: "{{total}}-аас {{current}}-р алхам",
  continue: "Үргэлжлүүлэх",

  guideTitle: "Хэрхэн хэвлэх вэ",
  guideIntro: "Ердөө дөрвөн алхам. Апп ч, хаяг ч шаардлагагүй.",
  guideScanTitle: "1. QR код уншуулах",
  guideScanBody: "Та утасныхаа камераар уншуулсан. Энэ алхам дууслаа.",
  guideChooseTitle: "2. Нэг файл сонгох",
  guideChooseBody: "Нэг зураг, эсвэл утсандаа хадгалсан нэг PDF.",
  guideCheckTitle: "3. Шалгаад хэвлэх",
  guideCheckBody: "Утсан дээрх зургийг хараад хэвлэх товчийг дарна уу.",
  guideCollectTitle: "4. Цаасаа авах",
  guideCollectBody: "Хэвлэгч том дэлгэцийн хажууд байна. Цаасаа тэндээс авна уу.",
  guideListen: "Алхмуудыг сонсох",
  guideStart: "Файлаа сонгох",
  languageReminder: "Хэлээ дараад ‘Үргэлжлүүлэх’ дарна уу.",
  guideReminder: "Дөрвөн алхмыг уншаад доод товчийг дарна уу.",

  chooseFile: "Хэвлэх нэг файлаа сонгоно уу",
  fileRules: "PDF, JPG эсвэл PNG · 10 MB хүртэл · 10 хуудас хүртэл",
  locationPhotos: "Зургаа нээх",
  locationFiles: "Файлаа нээх",
  cancelled: "Файл сонгоогүй байна. Доорх хоёр товчийн аль нэгийг дарна уу.",

  checkDocument: "Энэ хуудас зөв үү?",
  previewHelp: "Доор харагдаж байгаа яг тэр хэлбэрээр хэвлэгдэнэ. Сайн хараарай.",
  printSummary: "1 хувь · A4 цаас · хар цагаан · нэг тал",
  privacySummary: "Таны файл дамжуулах үед хамгаалагдсан байх бөгөөд хэвлэсний дараа шууд устана.",
  printOneCopy: "1 хувь хэвлэх",
  chooseAnother: "Өөр файл сонгох",

  encrypting: "Файлыг бэлдэж байна",
  uploading: "Файлыг илгээж байна",
  waitingForPrint: "Хэвлэгч эхлэх гэж байна",
  completed: "Бүх зүйл дууслаа",
  collectOutput: "Хэвлэгчээс цаасаа авна уу.",
  listenAgain: "Дахин сонсох",
  keepPageOpen: "Энэ хуудсыг хааж болохгүй.",
  preparingSession: "Бэлтгэж байна…",

  documentPreview: "Баримтын урьдчилсан харах",
  selectedDocumentPreview: "Сонгосон файлын урьдчилсан харах",
  pdfPreview: "PDF урьдчилсан харах",
  firstPagePreview: "Эхний хуудасны урьдчилсан харах",

  invalidQr: "Энэ холбоос бүрэн биш. Том дэлгэцэн дээрх QR кодыг дахин уншуулна уу.",
  expiredQr: "Энэ QR код хэтэрхий хуучин. Том дэлгэцэн дээрх шинэ QR кодыг уншуулна уу.",
  usedQr: "Энэ QR кодыг өөр хүн ашиглаж байна. Том дэлгэцэн дээрх шинийг уншуулна уу.",
  unsupportedType:
    "Зөвхөн PDF, JPG, PNG хэвлэнэ. Хуудсаа PDF болгож хадгалах эсвэл тод дэлгэцийн зураг авна уу.",
  tooLarge: "Энэ файл 10 MB-аас том. Зөвхөн шаардлагатай хуудсаа хадгална уу.",
  tooManyPages: "Энэ PDF 10 хуудсаас их. Зөвхөн шаардлагатай хуудсаа хадгална уу.",
  lockedPdf:
    "Энэ PDF нууц үгтэй. Утсан дээрээ нээгээд шаардлагатай хуудсуудын дэлгэцийн зургийг авна уу.",
  damagedFile: "Энэ файл нээгдэхгүй байна. Дахин хадгалах эсвэл тод дэлгэцийн зураг авна уу.",
  fingerprintMismatch:
    "Энэ холболтыг шалгаж чадсангүй. Том дэлгэцэн дээрх QR кодыг дахин уншуулна уу.",
  networkError: "Холболт тасарлаа. Мобайл датаа шалгаад QR кодыг дахин уншуулна уу.",

  chooseLocation: "Таны файл хаана байна?",
  locationKakao: "KakaoTalk дээр",
  locationEmail: "Имэйл дээр",
  locationMissing: "Надад файл байхгүй",
  kakaoGuide:
    "KakaoTalk дээр файлаа нээж, Хуваалцах дарж, утсандаа хадгална уу. Дараа нь энэ хуудсанд буцаж ирнэ үү.",
  emailGuide:
    "Утсан дээрээ имэйлийн хавсралтыг нээж хадгална уу. Дараа нь энэ хуудсанд буцаж ирнэ үү.",
  missingTitle: "Бид танд баримт хайж олох, шинээр гаргаж өгөх боломжгүй.",
  missingBody:
    "Захиалга хийсэн хүн, агаарын тээврийн компани эсвэл аяллын агентлагаас баримтыг утас руу тань илгээхийг хүсээрэй.",

  helpOpen: "Тусламж хэрэгтэй",
  helpTitle: "Одоо юу хийх вэ?",
  helpClose: "Ойлголоо",
  helpLanguage: "Хэл нь бичсэн хайрцгийг дарна уу. Дараа нь доод товчийг дарна уу.",
  helpGuide: "Дөрвөн богино алхмыг уншина уу. Дараа нь доод товчийг дарж файлаа сонгоно уу.",
  helpFile:
    "Хэвлэх зүйл зураг үү? ‘Зургаа нээх’ дарна уу. Хадгалсан PDF үү? ‘Файлаа нээх’ дарна уу. Зөвхөн нэг файл сонгоно уу.",
  helpPreview:
    "Зургийг хараарай. Зөв бол ‘1 хувь хэвлэх’ дарна уу. Буруу бол ‘Өөр файл сонгох’ дарна уу.",
  helpProgress:
    "Одоо юу ч дарах шаардлагагүй. Энэ хуудсыг нээлттэй байлгаж хүлээнэ үү. Цаас удахгүй гарна.",
  helpDone: "Таны цаас том дэлгэцийн хажуугийн хэвлэгч дээр байна. Аваад яваарай.",
  helpError: "Том дэлгэц дээрх QR кодыг дахин уншуулаад эхнээс нь дахин хийнэ үү.",
  helpAskStaff: "Хэвээр болохгүй бол хэвлэгчийн хажууд байгаа ажилтнаас асууна уу.",

  kioskScanTitle: "Утасныхаа камераар энэ QR кодыг уншуулна уу",
  kioskNoWifi: "Wi-Fi шаардлагагүй — мобайл дата хэрэглээрэй",
} satisfies Translation;

const uk = {
  brand: "Print-cess by Paradiso",

  selectLanguage: "Виберіть свою мову",
  selectLanguageHint: "Натисніть свою мову. Потім натисніть кнопку внизу.",
  step: "Крок {{current}} із {{total}}",
  continue: "Продовжити",

  guideTitle: "Як надрукувати",
  guideIntro: "Лише чотири кроки. Не потрібні ні застосунок, ні акаунт.",
  guideScanTitle: "1. Відскануйте QR-код",
  guideScanBody: "Ви відсканували його камерою телефону. Цей крок готовий.",
  guideChooseTitle: "2. Виберіть один файл",
  guideChooseBody: "Одне фото або один PDF, збережений у телефоні.",
  guideCheckTitle: "3. Перевірте і друкуйте",
  guideCheckBody: "Подивіться на зображення в телефоні й натисніть кнопку друку.",
  guideCollectTitle: "4. Заберіть свій аркуш",
  guideCollectBody: "Принтер стоїть біля великого екрана. Заберіть аркуш там.",
  guideListen: "Прослухати кроки",
  guideStart: "Вибрати файл",
  languageReminder: "Натисніть свою мову, потім натисніть «Продовжити».",
  guideReminder: "Прочитайте чотири кроки, потім натисніть кнопку внизу.",

  chooseFile: "Виберіть один файл для друку",
  fileRules: "PDF, JPG або PNG · до 10 МБ · до 10 сторінок",
  locationPhotos: "Відкрити мої фото",
  locationFiles: "Відкрити мої файли",
  cancelled: "Файл ще не вибрано. Натисніть одну з двох кнопок нижче.",

  checkDocument: "Це потрібна сторінка?",
  previewHelp: "Принтер надрукує саме те, що ви бачите нижче. Подивіться уважно.",
  printSummary: "1 копія · папір A4 · чорно-біла · один бік",
  privacySummary: "Ваш файл закритий, поки триває передача, і видаляється відразу після друку.",
  printOneCopy: "Надрукувати 1 копію",
  chooseAnother: "Вибрати інший файл",

  encrypting: "Готуємо ваш файл",
  uploading: "Надсилаємо ваш файл",
  waitingForPrint: "Принтер зараз почне",
  completed: "Готово",
  collectOutput: "Заберіть аркуш із принтера.",
  listenAgain: "Прослухати ще раз",
  keepPageOpen: "Не закривайте цю сторінку.",
  preparingSession: "Готуємось…",

  documentPreview: "Попередній перегляд документа",
  selectedDocumentPreview: "Попередній перегляд вибраного файла",
  pdfPreview: "Попередній перегляд PDF",
  firstPagePreview: "Попередній перегляд першої сторінки",

  invalidQr: "Це посилання неповне. Відскануйте QR-код на великому екрані ще раз.",
  expiredQr: "Цей QR-код застарів. Відскануйте новий QR-код на великому екрані.",
  usedQr: "Цим QR-кодом уже користуються. Відскануйте новий на великому екрані.",
  unsupportedType:
    "Друкуються лише PDF, JPG і PNG. Збережіть сторінку як PDF або зробіть чіткий знімок екрана.",
  tooLarge: "Цей файл більший за 10 МБ. Збережіть лише потрібні сторінки.",
  tooManyPages: "У цьому PDF більше 10 сторінок. Збережіть лише потрібні сторінки.",
  lockedPdf: "Цей PDF має пароль. Відкрийте його на телефоні й зніміть потрібні сторінки.",
  damagedFile: "Цей файл не відкривається. Збережіть його ще раз або зробіть чіткий знімок.",
  fingerprintMismatch:
    "Не вдалося перевірити це з’єднання. Відскануйте QR-код на великому екрані ще раз.",
  networkError: "З’єднання перервалося. Перевірте мобільний інтернет і відскануйте QR-код знову.",

  chooseLocation: "Де ваш файл?",
  locationKakao: "У KakaoTalk",
  locationEmail: "В електронній пошті",
  locationMissing: "У мене немає файла",
  kakaoGuide:
    "Відкрийте файл у KakaoTalk, натисніть «Поділитися» і збережіть його в телефон. Потім поверніться сюди.",
  emailGuide: "Відкрийте вкладення з листа на телефоні й збережіть його. Потім поверніться сюди.",
  missingTitle: "Ми не можемо знайти ваш документ і не можемо видати новий.",
  missingBody:
    "Попросіть того, хто оформляв бронювання, авіакомпанію або туристичну агенцію надіслати документ на ваш телефон.",

  helpOpen: "Потрібна допомога?",
  helpTitle: "Що робити зараз?",
  helpClose: "Зрозуміло",
  helpLanguage: "Натисніть клітинку зі своєю мовою. Потім натисніть кнопку внизу.",
  helpGuide: "Прочитайте чотири короткі кроки. Потім натисніть кнопку внизу, щоб вибрати файл.",
  helpFile:
    "Потрібно надрукувати фото? Натисніть «Відкрити мої фото». Це збережений PDF? Натисніть «Відкрити мої файли». Виберіть лише один файл.",
  helpPreview:
    "Подивіться на зображення. Якщо сторінка правильна, натисніть «Надрукувати 1 копію». Якщо ні — «Вибрати інший файл».",
  helpProgress:
    "Зараз нічого натискати не потрібно. Тримайте цю сторінку відкритою і почекайте. Аркуш скоро вийде.",
  helpDone: "Ваш аркуш у принтері біля великого екрана. Заберіть його.",
  helpError: "Підійдіть до великого екрана, відскануйте QR-код заново і почніть спочатку.",
  helpAskStaff: "Усе одно не виходить? Попросіть допомоги у працівника біля принтера.",

  kioskScanTitle: "Відскануйте цей QR-код камерою телефону",
  kioskNoWifi: "Wi-Fi не потрібен — використовуйте мобільний інтернет",
} satisfies Translation;

export const TRANSLATIONS: Record<SupportedLocale, Translation> = {
  en,
  ko,
  "zh-CN": zhCN,
  id,
  fil,
  vi,
  th,
  ne,
  km,
  ar,
  ru,
  mn,
  uk,
};

export function translate(
  locale: SupportedLocale,
  key: string,
  values?: Record<string, string | number>,
): string {
  const table: Record<string, string | undefined> = TRANSLATIONS[locale];
  const fallback: Record<string, string | undefined> = en;
  let value = table[key] ?? fallback[key] ?? key;
  for (const [name, replacement] of Object.entries(values ?? {})) {
    value = value.replaceAll(`{{${name}}}`, String(replacement));
  }
  return value;
}

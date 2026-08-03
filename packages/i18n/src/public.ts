export {
  LOCALE_NAMES,
  SUPPORTED_LOCALES,
  TRANSLATIONS,
  type SupportedLocale,
} from "./index";

import { translate as translateBase, type SupportedLocale } from "./index";

const KOREAN_COPY_OVERRIDES: Record<string, string> = {
  chooseLocation: "인쇄할 문서는 어디에 있나요?",
  locationMissing: "문서가 없어요",
  kakaoGuide:
    "휴대전화에서 카카오톡 파일을 연 뒤, 공유를 눌러 파일 앱이나 다운로드 폴더에 저장하세요.",
  emailGuide:
    "휴대전화에서 이메일 첨부파일을 연 뒤, 파일 앱이나 다운로드 폴더에 저장하세요.",
  missingTitle: "이곳에서는 문서를 찾거나 발급할 수 없어요.",
  missingBody: "예약한 분이나 항공사, 여행사에 문의하세요.",
  guideTitle: "인쇄 방법",
  guideIntro: "아래 네 단계만 따라 하면 됩니다. 로그인은 필요하지 않아요.",
  guideScanTitle: "1. QR코드 스캔하기",
  guideScanBody: "휴대전화 카메라로 화면의 QR코드를 스캔하세요.",
  guideChooseTitle: "2. 문서 선택하기",
  guideChooseBody: "사진 또는 PDF, JPG, PNG 파일 한 개를 선택하세요.",
  guideCheckTitle: "3. 확인 후 인쇄하기",
  guideCheckBody: "미리보기를 확인한 뒤 ‘A4 한 부 인쇄’를 누르세요.",
  guideCollectTitle: "4. 출력물 받기",
  guideCollectBody: "이 화면을 닫지 말고 프린터에서 출력물을 받으세요.",
  guideListen: "음성 안내 듣기",
  guideStart: "인쇄할 문서 선택",
  languageReminder: "언어를 선택한 뒤 ‘계속’을 누르세요.",
  guideReminder: "인쇄 방법을 확인한 뒤 문서를 선택하세요.",
  chooseFile: "인쇄할 문서를 선택하세요",
  checkDocument: "인쇄할 내용을 확인하세요",
  previewHelp: "미리보기를 확인하세요. A4 용지에 흑백 단면으로 한 부 인쇄됩니다.",
  privacySummary:
    "문서는 휴대전화에서 암호화되며, 서버에 저장된 암호화 파일은 처리 후 삭제됩니다.",
  printOneCopy: "A4 한 부 인쇄",
  chooseAnother: "다른 문서 선택",
  encrypting: "문서를 안전하게 처리하고 있어요",
  uploading: "문서를 전송하고 있어요",
  waitingForPrint: "인쇄를 준비하고 있어요",
  completed: "인쇄가 완료됐어요",
  collectOutput: "프린터에서 출력물을 받으세요.",
  listenAgain: "음성 안내 다시 듣기",
  invalidQr:
    "QR코드를 인식하지 못했어요. 키오스크 화면의 QR코드를 다시 스캔하세요.",
  expiredQr:
    "QR코드 사용 시간이 지났어요. 키오스크 화면의 새 QR코드를 스캔하세요.",
  usedQr:
    "이미 사용 중인 QR코드예요. 키오스크 화면의 새 QR코드를 스캔하세요.",
  unsupportedType:
    "PDF, JPG, PNG 파일만 인쇄할 수 있어요. 문서를 PDF로 저장하거나 화면을 선명하게 캡처하세요.",
  tooLarge:
    "파일이 10MB를 넘어요. 필요한 페이지만 저장하거나 화면을 선명하게 캡처하세요.",
  tooManyPages: "PDF가 10페이지를 넘어요. 필요한 페이지만 따로 저장하세요.",
  lockedPdf:
    "암호가 설정된 PDF예요. 휴대전화에서 연 뒤 필요한 페이지를 캡처해 저장하세요.",
  damagedFile:
    "파일을 열 수 없어요. 다시 저장하거나 화면을 선명하게 캡처하세요.",
  fingerprintMismatch:
    "안전한 연결을 확인하지 못했어요. QR코드를 다시 스캔하세요.",
  networkError:
    "연결이 끊겼어요. 모바일 데이터 연결을 확인한 뒤 QR코드를 다시 스캔하세요.",
  cancelled: "선택한 파일이 없어요.",
  preparingSession: "안전하게 연결하고 있어요…",
  keepPageOpen: "인쇄가 끝날 때까지 이 화면을 닫지 마세요.",
  documentPreview: "인쇄 미리보기",
  selectedDocumentPreview: "선택한 문서 미리보기",
  firstPagePreview: "첫 페이지 미리보기",
};

export function translate(
  locale: SupportedLocale,
  key: string,
  values?: Record<string, string | number>,
): string {
  if (locale === "ko") {
    const override = KOREAN_COPY_OVERRIDES[key];
    if (override) {
      let value = override;
      for (const [name, replacement] of Object.entries(values ?? {})) {
        value = value.replaceAll(`{{${name}}}`, String(replacement));
      }
      return value;
    }
  }

  return translateBase(locale, key, values);
}

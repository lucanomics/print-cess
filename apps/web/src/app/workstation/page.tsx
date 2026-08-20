import {
  ArrowLeft,
  Building2,
  Download,
  FileKey2,
  LockKeyhole,
  MonitorCheck,
  Send,
  ShieldCheck,
} from "lucide-react";

import { Wordmark } from "@print-cess/ui";

import { requestLocale } from "@/lib/request-locale";

import { WorkstationReadiness } from "./workstation-readiness";

const copy = {
  ko: {
    eyebrow: "국가기관 · 공공기관 업무용 PC",
    title: "설치 없이, 업무용 브라우저에서 바로 사용",
    intro:
      "휴대전화의 문서를 업무용 PC로 받거나, 업무용 PC의 파일을 다른 기기로 보낼 수 있습니다. 별도 프로그램, 브라우저 확장, 로그인은 필요하지 않습니다.",
    receiveTitle: "휴대전화 → 업무용 PC",
    receiveBody:
      "휴대전화에서 파일 보내기를 시작한 뒤 표시되는 전송 코드를 이 PC에서 입력합니다. QR 카메라 권한이 막힌 기관 PC에서도 코드 입력으로 받을 수 있습니다.",
    receiveCta: "이 PC에서 파일 받기",
    sendTitle: "업무용 PC → 휴대전화",
    sendBody:
      "업무용 PC에서 파일을 선택해 암호화 전송을 만들고, 휴대전화에서 QR 또는 전송 코드로 받습니다.",
    sendCta: "이 PC에서 파일 보내기",
    securityTitle: "기관 보안정책을 우회하지 않습니다",
    securityBody:
      "Print-cess는 브라우저의 표준 HTTPS와 Web Crypto를 사용합니다. 기관의 DLP, 다운로드 차단, 프록시, 망분리 또는 허용 도메인 정책이 전송을 막으면 해당 정책이 우선합니다.",
    privacyTitle: "업무용 사용 시 확인",
    privacyItems: [
      "실제 민감문서는 기관의 내부 보안지침에서 외부 웹서비스 사용을 허용하는 경우에만 전송하세요.",
      "전송 파일은 종단간 암호화되며, 서비스는 파일 내용을 해독하지 않도록 설계되어 있습니다.",
      "전송이 끝나면 받은 파일이 올바른 위치에 저장됐는지 확인하고 필요하면 전송을 즉시 삭제하세요.",
      "Internet Explorer 모드나 오래된 브라우저는 지원 대상이 아닙니다. 최신 Microsoft Edge 또는 Chrome 계열 브라우저를 권장합니다.",
    ],
    back: "처음으로",
    checking: "이 PC의 브라우저 호환성을 확인하는 중…",
    ready: "이 PC에서 핵심 기능을 사용할 수 있습니다",
    limited: "사용 가능하지만 일부 저장 기능이 제한될 수 있습니다",
    blocked: "이 브라우저에서는 안전한 전송을 시작할 수 없습니다",
    secureContext: "HTTPS 보안 연결",
    webCrypto: "표준 Web Crypto 암호화",
    fileApi: "브라우저 파일 선택 기능",
    downloadApi: "브라우저 다운로드 기능",
    pass: "사용 가능",
    fail: "제한됨",
    blockedHint:
      "HTTPS 접속인지 확인하고 최신 Edge 또는 Chrome으로 다시 여세요. 기관 정책이 기능을 차단한 경우 Print-cess가 이를 우회하지 않습니다.",
    limitedHint:
      "파일 수신은 가능할 수 있지만 저장 방식이 브라우저 기본 다운로드로 제한될 수 있습니다. 다운로드 폴더와 기관 보안정책을 확인하세요.",
  },
  en: {
    eyebrow: "Government · public-sector work computer",
    title: "Use Print-cess in a managed browser, with no install",
    intro:
      "Receive documents from a phone on a work computer, or send files from the work computer to another device. No desktop app, browser extension, or account is required.",
    receiveTitle: "Phone → work computer",
    receiveBody:
      "Start Send files on the phone and enter the transfer code on this computer. Code entry still works when a managed computer blocks camera access.",
    receiveCta: "Receive files on this computer",
    sendTitle: "Work computer → phone",
    sendBody:
      "Choose files on the work computer, create an encrypted transfer, then receive them on the phone with the QR code or transfer code.",
    sendCta: "Send files from this computer",
    securityTitle: "Print-cess does not bypass agency security controls",
    securityBody:
      "Print-cess uses standard browser HTTPS and Web Crypto. If DLP, download controls, proxies, network separation, or domain allowlists block a transfer, the agency policy takes precedence.",
    privacyTitle: "Before using it for work",
    privacyItems: [
      "Transfer real sensitive documents only when your organization permits the use of an external web service for that document class.",
      "Transfer payloads are end-to-end encrypted and the service is designed not to decrypt file contents.",
      "After receiving files, confirm where the browser saved them and delete the transfer immediately when appropriate.",
      "Internet Explorer mode and obsolete browsers are not supported. A current Microsoft Edge or Chromium-based browser is recommended.",
    ],
    back: "Back to start",
    checking: "Checking this browser for work-computer compatibility…",
    ready: "This browser supports the core transfer flow",
    limited: "Usable, but some save options may be limited",
    blocked: "This browser cannot start a secure transfer",
    secureContext: "HTTPS secure context",
    webCrypto: "Standards-based Web Crypto",
    fileApi: "Browser file selection",
    downloadApi: "Browser download support",
    pass: "Available",
    fail: "Limited",
    blockedHint:
      "Confirm that you opened the HTTPS site and retry in a current Edge or Chrome browser. Print-cess will not bypass a feature blocked by agency policy.",
    limitedHint:
      "Receiving may still work, but saving can fall back to the browser's normal Downloads folder. Check the saved location and your agency policy.",
  },
} as const;

export default async function WorkstationPage() {
  const locale = await requestLocale();
  const text = locale === "ko" ? copy.ko : copy.en;

  return (
    <main className="workstation-page">
      <header className="workstation-header">
        <Wordmark />
        <a className="workstation-back" href="/">
          <ArrowLeft aria-hidden="true" /> {text.back}
        </a>
      </header>

      <section className="workstation-hero">
        <div className="workstation-eyebrow">
          <Building2 aria-hidden="true" /> {text.eyebrow}
        </div>
        <h1>{text.title}</h1>
        <p>{text.intro}</p>
      </section>

      <WorkstationReadiness
        copy={{
          checking: text.checking,
          ready: text.ready,
          limited: text.limited,
          blocked: text.blocked,
          secureContext: text.secureContext,
          webCrypto: text.webCrypto,
          fileApi: text.fileApi,
          downloadApi: text.downloadApi,
          pass: text.pass,
          fail: text.fail,
          blockedHint: text.blockedHint,
          limitedHint: text.limitedHint,
        }}
      />

      <section className="workstation-actions" aria-label={text.title}>
        <article className="workstation-action-card">
          <div className="workstation-action-card__icon">
            <Download aria-hidden="true" />
          </div>
          <div>
            <h2>{text.receiveTitle}</h2>
            <p>{text.receiveBody}</p>
          </div>
          <a className="workstation-primary" href="/receive">
            <MonitorCheck aria-hidden="true" /> {text.receiveCta}
          </a>
        </article>

        <article className="workstation-action-card">
          <div className="workstation-action-card__icon">
            <Send aria-hidden="true" />
          </div>
          <div>
            <h2>{text.sendTitle}</h2>
            <p>{text.sendBody}</p>
          </div>
          <a className="workstation-primary" href="/send">
            <FileKey2 aria-hidden="true" /> {text.sendCta}
          </a>
        </article>
      </section>

      <section className="workstation-security">
        <div className="workstation-security__heading">
          <ShieldCheck aria-hidden="true" />
          <h2>{text.securityTitle}</h2>
        </div>
        <p>{text.securityBody}</p>
      </section>

      <section className="workstation-policy">
        <div className="workstation-policy__heading">
          <LockKeyhole aria-hidden="true" />
          <h2>{text.privacyTitle}</h2>
        </div>
        <ul>
          {text.privacyItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}

<p align="center">
  <img src="docs/assets/print-cess-mark.svg" alt="PRINT-CESS by Club Paradiso" width="104" />
</p>

<h1 align="center">PRINT-CESS</h1>

<p align="center"><strong>휴대폰에서 보내고, 로그인 없이 받고, 필요한 것만 바로 출력.</strong></p>
<p align="center">Secure browser-first document printing & file hand-off by Club Paradiso.</p>

<p align="center">
  <a href="https://print-cess.vercel.app/">Live web app</a> ·
  <a href="docs/ARCHITECTURE.md">Architecture</a> ·
  <a href="docs/SECURITY.md">Security</a> ·
  <a href="docs/PRIVACY.md">Privacy</a>
</p>

---

## 왜 PRINT-CESS인가요?

공용 PC나 민원 창구 앞에서 파일 하나 출력하려고 **카카오톡이나 메일에 로그인하고, 파일을 내려받고, 다시 로그아웃하는 일**은 생각보다 번거롭고 찝찝합니다. 인간은 문서 한 장을 뽑기 위해 놀라울 정도로 많은 인증 절차를 만들어냈습니다.

PRINT-CESS는 그 사이 단계를 줄이기 위해 만든 브라우저 기반 전송·출력 시스템입니다.

| 이런 상황이라면 | PRINT-CESS가 하는 일 |
| --- | --- |
| **휴대폰에 있는 파일을 바로 출력할 때** | 키오스크 QR을 스캔하고 휴대폰에서 파일을 선택해 전송·출력합니다. |
| **공용 PC에 로그인하기 꺼려질 때** | 메일·메신저 계정에 로그인하지 않고 브라우저만으로 파일을 옮길 수 있습니다. |
| **연락처·계정 공유 없이 파일을 주고받을 때** | `/send`와 `/receive`를 통해 앱 설치나 친구 추가 없이 파일을 전달합니다. |

## 핵심 기능

### 1. QR 기반 셀프 문서 출력

`/kiosk`에서 표시되는 QR을 휴대폰으로 스캔한 뒤 출력할 파일을 선택합니다.

- 별도 회원가입이나 앱 설치 없음
- **one document / one copy**를 기본으로 하는 단순한 현장 출력 흐름
- 휴대폰에서 파일을 로컬 암호화한 뒤 ciphertext만 전송
- 세션별 ECDH 키 교환과 AES-256-GCM 기반 보호
- 성공·실패·취소·만료 흐름 모두 정리(cleanup) 경로로 수렴

```mermaid
flowchart LR
  P["휴대폰"] -->|"QR 스캔 + 파일 선택"| E["로컬 암호화"]
  E -->|"ciphertext"| S["PRINT-CESS"]
  S -->|"세션별 전달"| K["키오스크 / 프린터"]
```

### 2. 계정 없는 파일 Hand-off

`/send`와 `/receive`는 출력과 별개의 **phone-to-phone / phone-to-PC 파일 전송 기능**입니다.

- 앱 설치 없음
- 계정 없음
- 연락처·친구 추가 없음
- 동일 Wi-Fi나 블루투스 페어링을 요구하지 않음
- QR 또는 공유 링크가 기본 전달 방식
- 파일 내용을 해석하지 않는 format-blind 전송
- HWP/HWPX를 포함해 다양한 문서·이미지·미디어·압축 파일을 그대로 전달
- 최대 20개 파일, 기본 총 2 GiB 한도(`DROP_MAX_TOTAL_MB`로 조정 가능)
- 8 MiB 단위 chunked AES-256-GCM 암호화
- 전송은 TTL 이후 정리되며, 발신자가 즉시 삭제할 수도 있음

기본 QR/공유 링크 경로에서는 서비스가 전송 코드를 알지 못하므로 저장된 파일 내용을 읽을 수 없습니다. 선택형 nearby pairing은 편의성을 위해 짧은 시간 동안 더 좁은 신뢰 경계를 사용합니다. 자세한 내용은 [`docs/FILE_TRANSFER.md`](docs/FILE_TRANSFER.md)를 참고하세요.

### 3. 공공·업무용 PC 브라우저 전송

`/workstation`은 관리형 Windows PC에서도 설치 없이 사용할 수 있도록 만든 진입점입니다.

- 데스크톱 앱 설치 불필요
- 브라우저 확장 프로그램 불필요
- 로컬 관리자 권한 불필요
- USB / ActiveX 불필요
- Web Crypto 및 표준 File API 기반 readiness check
- 휴대폰 → 업무 PC, 업무 PC → 휴대폰 양방향 전송

PRINT-CESS는 DLP, 프록시, 다운로드 제한, 망분리, 도메인 allowlist 같은 기관 정책을 우회하지 않습니다. 특정 기관 PC에서의 사용 가능 여부는 해당 환경에서 별도 검증해야 합니다. 자세한 경계는 [`docs/GOVERNMENT_WORKSTATION.md`](docs/GOVERNMENT_WORKSTATION.md)에 정리되어 있습니다.

## 보안·개인정보 원칙

PRINT-CESS의 목표는 단순히 "파일을 인터넷에 올렸다가 다시 받는 서비스"를 하나 더 만드는 것이 아닙니다.

- 문서 plaintext를 Vercel, Blob, Redis, QStash, 애플리케이션 로그나 metrics에 의도적으로 저장하지 않음
- 출력 흐름은 세션별 ECDH P-256 + HKDF-SHA-256 + AES-256-GCM 사용
- 파일 hand-off는 전송 코드에서 키를 유도하고 파일별·chunk별 인증 암호화 적용
- 만료·취소·완료 후 cleanup을 전제로 설계
- Production은 필요한 origin 및 provider 설정이 없으면 **fail closed**
- 개발·Preview·CI·fixture에는 실제 개인정보나 공식 민감 문서를 사용하지 않음

보안 모델과 저장 경계는 [`docs/SECURITY.md`](docs/SECURITY.md), [`docs/PRIVACY.md`](docs/PRIVACY.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)에 더 자세히 적혀 있습니다.

## 주요 경로

| Route | 용도 |
| --- | --- |
| `/kiosk` | 브라우저 키오스크 및 QR 기반 출력 세션 |
| `/send` | 파일 전송 생성 |
| `/receive` | QR·링크·코드를 통한 파일 수취 |
| `/workstation` | 관리형 공공·업무용 PC용 브라우저 진입점 |

Production web origin: **https://print-cess.vercel.app/**

> 웹 앱이 열리는 것과 실제 무인 출력 환경이 준비되었다는 것은 같은 의미가 아닙니다. 실물 프린터, 드라이버, kiosk 설정 및 provider credential은 별도 acceptance가 필요합니다.

## Quick start

### Required tools

- Node.js **24.18.0** (`.nvmrc`)
- pnpm **11.15.1** via Corepack
- Git and GitHub CLI
- Playwright Chromium/WebKit binaries for E2E tests
- .NET SDK 8 on Windows for WPF kiosk validation and publishing

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example apps/web/.env.local
pnpm dev
```

개발 서버가 뜨면 다음 경로부터 확인할 수 있습니다.

```text
http://localhost:3000/kiosk
http://localhost:3000/send
http://localhost:3000/receive
http://localhost:3000/workstation
```

로컬 개발 모드에서는 애플리케이션 전용 개발 디렉터리에 ciphertext만 저장합니다. Production/Preview 환경은 필요한 HTTPS origin과 Blob, Redis, QStash, kiosk-registration, administrator credential이 없으면 실패하도록 구성되어 있습니다.

## Repository structure

```text
apps/web       Next.js web app, kiosk, mobile flows, file hand-off, Route Handlers
apps/kiosk     .NET 8 WPF kiosk, core, infrastructure, tests
packages       protocol, cryptography, translations, UI, test fixtures
docs           architecture, security, privacy, deployment, operations, acceptance
scripts        deployment, kiosk, GitHub workflow, readiness/acceptance helpers
```

## Validation

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm test:e2e
```

Windows 전용 검증은 GitHub Actions에서 별도로 수행합니다. CI가 초록색이라는 사실만으로 특정 프린터 모델이나 드라이버가 실제 현장에서 동작한다고 간주하지 않습니다. 실물 프린터 acceptance는 별도 증거가 필요합니다.

## Deployment notes

macOS 브라우저 키오스크는 [`docs/MACOS_BROWSER_KIOSK.md`](docs/MACOS_BROWSER_KIOSK.md), Windows kiosk 배포는 [`docs/WINDOWS_KIOSK_DEPLOYMENT.md`](docs/WINDOWS_KIOSK_DEPLOYMENT.md)를 따릅니다.

Vercel Preview/Production 작업 전에는 [`docs/VERCEL_DEPLOYMENT.md`](docs/VERCEL_DEPLOYMENT.md)를 확인하세요. Windows mock printer는 `PRINT_CESS_ENVIRONMENT=Development`와 loopback server에서만 사용할 수 있으며 Production 설치에서는 활성화할 수 없습니다.

## 더 깊게 보기

| 문서 | 내용 |
| --- | --- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 전체 시스템과 출력 세션 구조 |
| [`docs/FILE_TRANSFER.md`](docs/FILE_TRANSFER.md) | 파일 hand-off 프로토콜과 암호화 |
| [`docs/FILE_COMPATIBILITY.md`](docs/FILE_COMPATIBILITY.md) | 파일 형식, 이름, 크기, 저장 위치 |
| [`docs/GOVERNMENT_WORKSTATION.md`](docs/GOVERNMENT_WORKSTATION.md) | 공공·업무용 PC 보안 경계 |
| [`docs/SECURITY.md`](docs/SECURITY.md) | 보안 invariant와 위협 모델 |
| [`docs/PRIVACY.md`](docs/PRIVACY.md) | 데이터 및 개인정보 처리 경계 |
| [`docs/GITHUB_WORKFLOW.md`](docs/GITHUB_WORKFLOW.md) | 브랜치·PR·CI 운영 방식 |
| [`docs/READINESS_EVIDENCE.md`](docs/READINESS_EVIDENCE.md) | 실제 배포 전 acceptance evidence |

## Review workflow

구현 변경은 짧은 branch에서 작업하고 protected `main`으로 PR을 올리는 방식을 기본으로 합니다.

```bash
git push -u origin <branch>
gh pr create --draft --base main --head <branch>
gh pr checks --watch
```

Merge는 코드 통합이지 Production 승인 자체는 아닙니다. 실제 출력 환경과 공공기관 PC는 각각 별도 acceptance를 거쳐야 합니다.

---

<p align="center"><strong>PRINT-CESS by Club Paradiso</strong><br/>파일을 옮기려고 공용 PC에 내 인생 전체를 로그인하지 않아도 되게.</p>

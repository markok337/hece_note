# 키 발급과 초기 세팅

`.env.example`의 값을 채우기 위해 내가 직접 해야 하는 작업 목록이다. 순서대로 진행한다.

## 1. Supabase 프로젝트 만들기

1. https://supabase.com 에 GitHub 계정으로 가입한다.
2. New project를 만든다.
   - Region: **Northeast Asia (Seoul)**
   - Database password: 길게 만들고 따로 보관한다. 2-4단계의 `SUPABASE_DB_URL`에 들어간다.
   - 요금제: Free

## 2. 키 복사해서 `.env`에 넣기

프로젝트 루트의 `.env` 파일(이미 빈 칸으로 만들어 둠)을 연다.

1. Project Settings > Data API > Project URL → `VITE_SUPABASE_URL`
2. Project Settings > API Keys > Publishable key (`sb_publishable_...`) → `VITE_SUPABASE_PUBLISHABLE_KEY`
3. 같은 화면의 Secret key (`sb_secret_...`) → `SUPABASE_SECRET_KEY`
4. 상단 Connect 버튼 > Connection string > Session pooler URI → `SUPABASE_DB_URL`
   (`[YOUR-PASSWORD]` 자리에 1단계의 DB 비밀번호를 넣는다)

## 3. 나 혼자만 쓰는 계정 만들기

1. Authentication > Sign In / Providers
   - **Allow new users to sign up: 끈다.** 남이 계정을 만들 수 없게 한다.
   - Email provider는 켜 둔다. "Confirm email"은 꺼도 된다.
2. Authentication > Users > Add user > Create new user
   - Email: 로그인 ID. 실제 메일이 오가지 않으니 개인 메일 말고 형식만 맞춘 주소를 쓴다.
   - Password: **나만 아는 키**. 20자 이상. 이 값은 어디에도 저장하지 않고 기기에서만 입력한다.
   - Auto Confirm User: 켠다.
3. 위 Email을 `.env`의 `VITE_OWNER_LOGIN_ID`에 넣는다.

## 4. GitHub 저장소 설정

저장소: https://github.com/markok337/hece_note

1. Settings > Pages > Source: **GitHub Actions**
2. Settings > Secrets and variables > Actions > New repository secret 로 아래 세 개를 등록한다.
   빌드와 Supabase 일시정지 방지 작업이 쓴다.

   | 이름 | 값 |
   |---|---|
   | `VITE_SUPABASE_URL` | `.env`와 같은 값 |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env`와 같은 값 |
   | `VITE_OWNER_LOGIN_ID` | `.env`와 같은 값 |

   `SUPABASE_SECRET_KEY`와 `SUPABASE_DB_URL`은 GitHub에 올리지 않는다.

## 5. 테이블 만들기

Supabase 웹 > SQL Editor > New query 에 `supabase/migrations/`의 파일을 **번호 순서대로** 하나씩 통째로 붙여 넣고 Run 한다.
파일 안의 내용은 여러 번 실행해도 안전하다. 이미 실행한 번호는 다시 돌릴 필요가 없다.

새 기능이 테이블을 더하거나 바꿀 때는 기존 파일을 고치지 않고 다음 번호(`0006_….sql`)의 새 파일을 만든다.
`create table if not exists`는 이미 있는 테이블에 컬럼을 더해 주지 않기 때문이다.

- `0001_device_pings.sql`: 접속 기록 테이블. 화면에서는 더 쓰지 않지만, Supabase 일시정지 방지 작업(`keepalive`)이 이 테이블을 조회하므로 만들어 둔다.
- `0002_blog.sql`: 블로그 스케줄 달력 테이블. 사용자(3단계)를 먼저 만들어 둬야 한다. 분야 순환 규칙의 첫 행이 그 사용자의 것으로 들어간다.
- `0003_fridge.sql`: 냉장고 탭의 재료(`fridge_items`)와 구매목록(`shopping_items`) 테이블. 실행하지 않으면 냉장고 탭이 "불러오기 실패"를 띄운다.
- `0004_ledger.sql`: 가계부 탭의 지출 항목, 분류, 예산 규칙, 카드 테이블. 실행하지 않으면 가계부 탭이 "불러오기 실패"를 띄운다.
- `0005_ledger_sms.sql`: 가계부 문자함 테이블(`ledger_sms`)을 만들고, 0004의 확인한 문자 테이블을 없애며, 카드의 견본 컬럼을 바꾼다. 0004 다음에 실행한다. 실행하지 않으면 가계부 탭이 "불러오기 실패"를 띄운다.

## 6. 기기에 설치하기

첫 푸시 뒤 Actions의 `deploy`가 끝나면(1~2분) `https://markok337.github.io/hece_note/` 가 열린다.

- **갤럭시 S26, 폴드8, 탭 S9+**: Chrome에서 주소를 열고 메뉴(⋮) > "앱 설치".
- **데스크톱, 노트북**: Chrome이나 Edge에서 주소를 열고 주소창 오른쪽의 설치 아이콘.

설치한 앱을 열면 개인 키를 한 번 묻는다. 그 뒤 달력이 뜬다. 한 기기에서 날짜를 고치면 다른 기기 화면에 바로 반영되는지 확인한다.

## 7. 다 했는지 확인

- [ ] `.env`의 다섯 칸이 모두 채워졌다
- [ ] `supabase/migrations/`의 파일을 번호 순서대로 모두 실행했다
- [ ] 가입 허용이 꺼져 있다
- [ ] 사용자가 정확히 한 명이다
- [ ] GitHub Pages 소스가 GitHub Actions다
- [ ] GitHub Secrets 세 개가 등록됐다

배포 주소는 첫 배포 후 `https://markok337.github.io/hece_note/` 가 된다.

## 8. 안드로이드 앱 만들고 설치하기

가계부의 문자 불러오기는 폰에 설치한 안드로이드 앱(APK)에서만 된다. APK는 배포 주소를 여는 껍데기라서 한 번 설치하면 화면 업데이트에 다시 설치할 필요가 없다. 플레이스토어에는 올리지 않고 직접 설치한다.

**필요한 것**: Android Studio(SDK 포함), JDK 21~24, Node. Android Studio에 들어 있는 JDK가 25인 경우 Gradle 8.14가 지원하지 않으므로 `JAVA_HOME`을 JDK 23 같은 21~24 버전으로 가리킨다.

**APK 만들기** (저장소 루트에서)
1. `android/local.properties` 파일에 SDK 경로를 적는다(저장소에는 올리지 않는다): `sdk.dir=C:/Users/<사용자>/AppData/Local/Android/Sdk` (슬래시를 쓴다).
2. `cd android`, `JAVA_HOME`을 JDK 23 같은 폴더로 지정한 뒤 `gradlew assembleDebug` 를 실행한다. 처음에는 도구를 내려받느라 몇 분 걸린다.
3. 결과물은 `android/app/build/outputs/apk/debug/app-debug.apk`다.

**폰에 설치하기**
- USB 디버깅을 켜고 연결했다면 `<SDK경로>/platform-tools/adb install -r app-debug.apk`.
- 아니면 APK 파일을 폰으로 옮겨 열고, "출처를 알 수 없는 앱 설치"를 허용한다.

**문자 권한 허용하기**: 안드로이드 13 이후에는 직접 설치한 앱의 문자 권한이 막혀 있다.
1. 앱을 한 번 열었다가 닫는다.
2. 설정 > 앱 > hece note > 오른쪽 위 ⋮ > "제한된 설정 허용"을 켠다.
3. 앱에서 가계부의 "불러오기"를 누르면 문자 권한을 묻는다. 허용한다.

앱은 처음 한 번 인터넷으로 배포 주소를 열어야 한다. 인터넷이 끊기면 "인터넷에 연결되지 않았다" 창이 뜬다.

import type { SupportedLocale } from "@print-cess/i18n";

export type PrintBatchCopy = {
  chooseFiles: string;
  rules: string;
  rulesHancom: string;
  checkFiles: string;
  previewHelp: string;
  printFiles: string;
  changeSelection: string;
  selected: string;
  tooManyFiles: string;
  batchTooLarge: string;
  guideChooseTitle: string;
  guideChooseBody: string;
  guideChooseBodyHancom: string;
  helpFile: string;
  helpPreview: string;
};

const COPY: Record<SupportedLocale, PrintBatchCopy> = {
  en: {
    chooseFiles: "Pick files to print",
    rules: "Up to 10 photos or PDFs · 32 MB total · each PDF up to 10 pages",
    rulesHancom: "Up to 10 photos, PDFs or HWP/HWPX files · 32 MB total · each PDF up to 10 pages",
    checkFiles: "Check these files",
    previewHelp: "They print once each, in the order shown below.",
    printFiles: "Print {{count}} files",
    changeSelection: "Choose different files",
    selected: "{{count}} files selected",
    tooManyFiles: "You can print up to 10 files at once. Pick fewer files.",
    batchTooLarge: "These files are too large together. Keep the whole print job under 32 MB.",
    guideChooseTitle: "2. Pick your files",
    guideChooseBody: "Choose up to 10 photos or PDFs from your phone.",
    guideChooseBodyHancom:
      "Choose up to 10 photos, PDFs or supported HWP/HWPX files from your phone.",
    helpFile:
      "Pick one or several photos or documents. You can select up to 10 files in one print job.",
    helpPreview:
      "Check the list. The files print once each in this order, then tap the print button.",
  },
  ko: {
    chooseFiles: "출력할 파일을 선택하세요",
    rules: "사진·PDF 최대 10개 · 전체 32MB 이하 · PDF는 파일당 최대 10쪽",
    rulesHancom: "사진·PDF·HWP/HWPX 최대 10개 · 전체 32MB 이하 · PDF는 파일당 최대 10쪽",
    checkFiles: "선택한 파일을 확인하세요",
    previewHelp: "아래 순서대로 각 파일을 1부씩 출력합니다.",
    printFiles: "파일 {{count}}개 출력하기",
    changeSelection: "파일 다시 선택하기",
    selected: "파일 {{count}}개 선택됨",
    tooManyFiles: "한 번에 최대 10개까지 출력할 수 있습니다. 파일 수를 줄여 주세요.",
    batchTooLarge:
      "선택한 파일의 전체 용량이 너무 큽니다. 한 번의 출력은 32MB 이하로 선택해 주세요.",
    guideChooseTitle: "2. 파일을 선택하세요",
    guideChooseBody: "휴대전화에서 사진이나 PDF를 최대 10개까지 선택할 수 있습니다.",
    guideChooseBodyHancom:
      "휴대전화에서 사진, PDF 또는 지원되는 HWP/HWPX 파일을 최대 10개까지 선택할 수 있습니다.",
    helpFile:
      "사진이나 문서를 하나 또는 여러 개 선택하세요. 한 번에 최대 10개까지 출력할 수 있습니다.",
    helpPreview:
      "목록과 순서를 확인하세요. 각 파일을 1부씩 출력합니다. 맞으면 출력 버튼을 누르세요.",
  },
  "zh-CN": {
    chooseFiles: "选择要打印的文件",
    rules: "最多10个照片或PDF · 总计不超过32MB · 每个PDF最多10页",
    rulesHancom: "最多10个照片、PDF或HWP/HWPX文件 · 总计不超过32MB · 每个PDF最多10页",
    checkFiles: "确认所选文件",
    previewHelp: "将按以下顺序每个文件打印1份。",
    printFiles: "打印{{count}}个文件",
    changeSelection: "重新选择文件",
    selected: "已选择{{count}}个文件",
    tooManyFiles: "一次最多可打印10个文件。请减少文件数量。",
    batchTooLarge: "这些文件合计过大。一次打印请控制在32MB以内。",
    guideChooseTitle: "2. 选择文件",
    guideChooseBody: "可从手机中选择最多10个照片或PDF。",
    guideChooseBodyHancom: "可从手机中选择最多10个照片、PDF或受支持的HWP/HWPX文件。",
    helpFile: "请选择一个或多个照片或文档。一次最多可打印10个文件。",
    helpPreview: "请确认列表和顺序。每个文件打印1份，然后点击打印按钮。",
  },
  id: {
    chooseFiles: "Pilih file yang akan dicetak",
    rules: "Maks. 10 foto atau PDF · total 32 MB · tiap PDF maks. 10 halaman",
    rulesHancom: "Maks. 10 foto, PDF, atau HWP/HWPX · total 32 MB · tiap PDF maks. 10 halaman",
    checkFiles: "Periksa file yang dipilih",
    previewHelp: "Setiap file dicetak 1 salinan sesuai urutan di bawah.",
    printFiles: "Cetak {{count}} file",
    changeSelection: "Pilih file lain",
    selected: "{{count}} file dipilih",
    tooManyFiles: "Maksimal 10 file dapat dicetak sekaligus. Pilih lebih sedikit file.",
    batchTooLarge: "Total file terlalu besar. Batasi satu pekerjaan cetak hingga 32 MB.",
    guideChooseTitle: "2. Pilih file",
    guideChooseBody: "Pilih hingga 10 foto atau PDF dari ponsel Anda.",
    guideChooseBodyHancom:
      "Pilih hingga 10 foto, PDF, atau file HWP/HWPX yang didukung dari ponsel Anda.",
    helpFile: "Pilih satu atau beberapa foto atau dokumen. Maksimal 10 file per pekerjaan cetak.",
    helpPreview:
      "Periksa daftar dan urutannya. Setiap file dicetak sekali, lalu ketuk tombol cetak.",
  },
  fil: {
    chooseFiles: "Piliin ang mga file na ipi-print",
    rules: "Hanggang 10 larawan o PDF · 32 MB kabuuan · hanggang 10 pahina bawat PDF",
    rulesHancom:
      "Hanggang 10 larawan, PDF o HWP/HWPX · 32 MB kabuuan · hanggang 10 pahina bawat PDF",
    checkFiles: "Suriin ang napiling mga file",
    previewHelp: "Tig-iisang kopya ang ipi-print sa pagkakasunod na nasa ibaba.",
    printFiles: "I-print ang {{count}} file",
    changeSelection: "Pumili ng ibang mga file",
    selected: "{{count}} file ang napili",
    tooManyFiles: "Hanggang 10 file lang ang maaaring i-print nang sabay. Bawasan ang mga file.",
    batchTooLarge:
      "Masyadong malaki ang kabuuang file. Panatilihin sa ilalim ng 32 MB ang isang print job.",
    guideChooseTitle: "2. Piliin ang mga file",
    guideChooseBody: "Pumili ng hanggang 10 larawan o PDF mula sa iyong telepono.",
    guideChooseBodyHancom:
      "Pumili ng hanggang 10 larawan, PDF o suportadong HWP/HWPX file mula sa iyong telepono.",
    helpFile: "Pumili ng isa o maraming larawan o dokumento. Hanggang 10 file bawat print job.",
    helpPreview:
      "Suriin ang listahan at ayos. Tig-iisang kopya ang ipi-print, saka pindutin ang print.",
  },
  vi: {
    chooseFiles: "Chọn các tệp cần in",
    rules: "Tối đa 10 ảnh hoặc PDF · tổng 32 MB · mỗi PDF tối đa 10 trang",
    rulesHancom: "Tối đa 10 ảnh, PDF hoặc HWP/HWPX · tổng 32 MB · mỗi PDF tối đa 10 trang",
    checkFiles: "Kiểm tra các tệp đã chọn",
    previewHelp: "Mỗi tệp sẽ được in 1 bản theo thứ tự bên dưới.",
    printFiles: "In {{count}} tệp",
    changeSelection: "Chọn lại tệp",
    selected: "Đã chọn {{count}} tệp",
    tooManyFiles: "Mỗi lần chỉ có thể in tối đa 10 tệp. Hãy chọn ít tệp hơn.",
    batchTooLarge: "Tổng dung lượng các tệp quá lớn. Một lần in phải dưới 32 MB.",
    guideChooseTitle: "2. Chọn tệp",
    guideChooseBody: "Chọn tối đa 10 ảnh hoặc PDF từ điện thoại.",
    guideChooseBodyHancom: "Chọn tối đa 10 ảnh, PDF hoặc tệp HWP/HWPX được hỗ trợ từ điện thoại.",
    helpFile: "Chọn một hoặc nhiều ảnh hay tài liệu. Mỗi lần in tối đa 10 tệp.",
    helpPreview: "Kiểm tra danh sách và thứ tự. Mỗi tệp in 1 bản, sau đó nhấn nút in.",
  },
  th: {
    chooseFiles: "เลือกไฟล์ที่จะพิมพ์",
    rules: "สูงสุด 10 รูปหรือ PDF · รวมไม่เกิน 32 MB · PDF ละไม่เกิน 10 หน้า",
    rulesHancom: "สูงสุด 10 รูป, PDF หรือ HWP/HWPX · รวมไม่เกิน 32 MB · PDF ละไม่เกิน 10 หน้า",
    checkFiles: "ตรวจสอบไฟล์ที่เลือก",
    previewHelp: "แต่ละไฟล์จะพิมพ์ 1 ชุดตามลำดับด้านล่าง",
    printFiles: "พิมพ์ {{count}} ไฟล์",
    changeSelection: "เลือกไฟล์ใหม่",
    selected: "เลือกแล้ว {{count}} ไฟล์",
    tooManyFiles: "พิมพ์ได้สูงสุด 10 ไฟล์ต่อครั้ง โปรดเลือกให้น้อยลง",
    batchTooLarge: "ไฟล์รวมกันใหญ่เกินไป งานพิมพ์หนึ่งครั้งต้องไม่เกิน 32 MB",
    guideChooseTitle: "2. เลือกไฟล์",
    guideChooseBody: "เลือกภาพหรือ PDF จากโทรศัพท์ได้สูงสุด 10 ไฟล์",
    guideChooseBodyHancom: "เลือกภาพ, PDF หรือ HWP/HWPX ที่รองรับจากโทรศัพท์ได้สูงสุด 10 ไฟล์",
    helpFile: "เลือกภาพหรือเอกสารหนึ่งไฟล์หรือหลายไฟล์ได้ สูงสุด 10 ไฟล์ต่อการพิมพ์หนึ่งครั้ง",
    helpPreview: "ตรวจสอบรายการและลำดับ แต่ละไฟล์พิมพ์ 1 ชุด แล้วกดปุ่มพิมพ์",
  },
  ne: {
    chooseFiles: "प्रिन्ट गर्ने फाइलहरू छान्नुहोस्",
    rules: "बढीमा १० फोटो वा PDF · जम्मा ३२ MB · प्रत्येक PDF बढीमा १० पृष्ठ",
    rulesHancom: "बढीमा १० फोटो, PDF वा HWP/HWPX · जम्मा ३२ MB · प्रत्येक PDF बढीमा १० पृष्ठ",
    checkFiles: "छानिएका फाइलहरू जाँच्नुहोस्",
    previewHelp: "तल देखिएको क्रमअनुसार प्रत्येक फाइलको १ प्रति प्रिन्ट हुन्छ।",
    printFiles: "{{count}} फाइल प्रिन्ट गर्नुहोस्",
    changeSelection: "अर्का फाइलहरू छान्नुहोस्",
    selected: "{{count}} फाइल छानियो",
    tooManyFiles: "एक पटकमा बढीमा १० फाइल प्रिन्ट गर्न सकिन्छ। कम फाइल छान्नुहोस्।",
    batchTooLarge: "फाइलहरूको जम्मा आकार धेरै ठूलो छ। एउटा प्रिन्ट काम ३२ MB भित्र राख्नुहोस्।",
    guideChooseTitle: "2. फाइलहरू छान्नुहोस्",
    guideChooseBody: "फोनबाट बढीमा १० फोटो वा PDF छान्नुहोस्।",
    guideChooseBodyHancom: "फोनबाट बढीमा १० फोटो, PDF वा समर्थित HWP/HWPX फाइल छान्नुहोस्।",
    helpFile: "एक वा धेरै फोटो वा कागजात छान्नुहोस्। एउटै प्रिन्ट काममा बढीमा १० फाइल।",
    helpPreview:
      "सूची र क्रम जाँच्नुहोस्। प्रत्येक फाइल १ पटक प्रिन्ट हुन्छ, त्यसपछि प्रिन्ट बटन थिच्नुहोस्।",
  },
  km: {
    chooseFiles: "ជ្រើសឯកសារដែលត្រូវបោះពុម្ព",
    rules: "អតិបរមា 10 រូប ឬ PDF · សរុប 32 MB · PDF នីមួយៗអតិបរមា 10 ទំព័រ",
    rulesHancom: "អតិបរមា 10 រូប, PDF ឬ HWP/HWPX · សរុប 32 MB · PDF នីមួយៗអតិបរមា 10 ទំព័រ",
    checkFiles: "ពិនិត្យឯកសារដែលបានជ្រើស",
    previewHelp: "ឯកសារនីមួយៗនឹងបោះពុម្ព 1 ច្បាប់តាមលំដាប់ខាងក្រោម។",
    printFiles: "បោះពុម្ព {{count}} ឯកសារ",
    changeSelection: "ជ្រើសឯកសារផ្សេង",
    selected: "បានជ្រើស {{count}} ឯកសារ",
    tooManyFiles: "អាចបោះពុម្ពបានអតិបរមា 10 ឯកសារក្នុងមួយដង។ សូមជ្រើសតិចជាងនេះ។",
    batchTooLarge: "ទំហំឯកសារសរុបធំពេក។ ការបោះពុម្ពមួយដងត្រូវក្រោម 32 MB។",
    guideChooseTitle: "2. ជ្រើសឯកសារ",
    guideChooseBody: "ជ្រើសរូប ឬ PDF ពីទូរស័ព្ទបានអតិបរមា 10 ឯកសារ។",
    guideChooseBodyHancom: "ជ្រើសរូប, PDF ឬ HWP/HWPX ដែលគាំទ្រពីទូរស័ព្ទបានអតិបរមា 10 ឯកសារ។",
    helpFile: "ជ្រើសរូប ឬឯកសារមួយ ឬច្រើន។ ការបោះពុម្ពមួយដងអតិបរមា 10 ឯកសារ។",
    helpPreview: "ពិនិត្យបញ្ជី និងលំដាប់។ ឯកសារនីមួយៗបោះពុម្ព 1 ច្បាប់ រួចចុចប៊ូតុងបោះពុម្ព។",
  },
  ar: {
    chooseFiles: "اختر الملفات للطباعة",
    rules: "حتى 10 صور أو ملفات PDF · إجمالي 32 MB · كل PDF حتى 10 صفحات",
    rulesHancom: "حتى 10 صور أو PDF أو HWP/HWPX · إجمالي 32 MB · كل PDF حتى 10 صفحات",
    checkFiles: "تحقق من الملفات المحددة",
    previewHelp: "ستُطبع نسخة واحدة من كل ملف بالترتيب أدناه.",
    printFiles: "طباعة {{count}} ملفات",
    changeSelection: "اختيار ملفات أخرى",
    selected: "تم تحديد {{count}} ملفات",
    tooManyFiles: "يمكن طباعة 10 ملفات كحد أقصى في المرة الواحدة. اختر ملفات أقل.",
    batchTooLarge: "الحجم الإجمالي للملفات كبير جدًا. اجعل مهمة الطباعة أقل من 32 MB.",
    guideChooseTitle: "2. اختر الملفات",
    guideChooseBody: "اختر حتى 10 صور أو ملفات PDF من هاتفك.",
    guideChooseBodyHancom: "اختر حتى 10 صور أو PDF أو ملفات HWP/HWPX المدعومة من هاتفك.",
    helpFile: "اختر صورة أو مستندًا واحدًا أو عدة ملفات. الحد الأقصى 10 ملفات لكل مهمة طباعة.",
    helpPreview: "تحقق من القائمة والترتيب. تُطبع نسخة واحدة من كل ملف، ثم اضغط زر الطباعة.",
  },
  ru: {
    chooseFiles: "Выберите файлы для печати",
    rules: "До 10 фото или PDF · всего до 32 МБ · каждый PDF до 10 страниц",
    rulesHancom: "До 10 фото, PDF или HWP/HWPX · всего до 32 МБ · каждый PDF до 10 страниц",
    checkFiles: "Проверьте выбранные файлы",
    previewHelp: "Каждый файл будет напечатан в 1 экземпляре в указанном порядке.",
    printFiles: "Напечатать {{count}} файлов",
    changeSelection: "Выбрать другие файлы",
    selected: "Выбрано файлов: {{count}}",
    tooManyFiles: "За один раз можно напечатать не более 10 файлов. Выберите меньше файлов.",
    batchTooLarge: "Общий размер файлов слишком велик. Одна печать должна быть меньше 32 МБ.",
    guideChooseTitle: "2. Выберите файлы",
    guideChooseBody: "Выберите на телефоне до 10 фото или PDF.",
    guideChooseBodyHancom:
      "Выберите на телефоне до 10 фото, PDF или поддерживаемых HWP/HWPX файлов.",
    helpFile: "Выберите один или несколько снимков или документов. До 10 файлов за одну печать.",
    helpPreview:
      "Проверьте список и порядок. Каждый файл печатается один раз, затем нажмите кнопку печати.",
  },
  mn: {
    chooseFiles: "Хэвлэх файлуудаа сонгоно уу",
    rules: "10 хүртэл зураг эсвэл PDF · нийт 32 MB · PDF бүр 10 хүртэл хуудас",
    rulesHancom: "10 хүртэл зураг, PDF эсвэл HWP/HWPX · нийт 32 MB · PDF бүр 10 хүртэл хуудас",
    checkFiles: "Сонгосон файлуудаа шалгана уу",
    previewHelp: "Доорх дарааллаар файл бүрийг 1 хувь хэвлэнэ.",
    printFiles: "{{count}} файл хэвлэх",
    changeSelection: "Өөр файл сонгох",
    selected: "{{count}} файл сонгосон",
    tooManyFiles: "Нэг удаад хамгийн ихдээ 10 файл хэвлэнэ. Файлын тоог багасгана уу.",
    batchTooLarge: "Файлуудын нийт хэмжээ хэт их байна. Нэг хэвлэлтийг 32 MB-аас бага байлгана уу.",
    guideChooseTitle: "2. Файлуудаа сонгоно уу",
    guideChooseBody: "Утаснаасаа 10 хүртэл зураг эсвэл PDF сонгоно уу.",
    guideChooseBodyHancom:
      "Утаснаасаа 10 хүртэл зураг, PDF эсвэл дэмжигдэх HWP/HWPX файл сонгоно уу.",
    helpFile: "Нэг эсвэл хэд хэдэн зураг, баримт сонгоно уу. Нэг хэвлэлтэд 10 хүртэл файл.",
    helpPreview:
      "Жагсаалт ба дарааллыг шалгана уу. Файл бүр 1 удаа хэвлэгдэнэ, дараа нь хэвлэх товчийг дарна уу.",
  },
  uk: {
    chooseFiles: "Виберіть файли для друку",
    rules: "До 10 фото або PDF · загалом до 32 МБ · кожен PDF до 10 сторінок",
    rulesHancom: "До 10 фото, PDF або HWP/HWPX · загалом до 32 МБ · кожен PDF до 10 сторінок",
    checkFiles: "Перевірте вибрані файли",
    previewHelp: "Кожен файл буде надруковано в 1 примірнику в наведеному порядку.",
    printFiles: "Надрукувати {{count}} файлів",
    changeSelection: "Вибрати інші файли",
    selected: "Вибрано файлів: {{count}}",
    tooManyFiles: "За один раз можна надрукувати не більше 10 файлів. Виберіть менше файлів.",
    batchTooLarge: "Загальний розмір файлів завеликий. Одне завдання друку має бути менше 32 МБ.",
    guideChooseTitle: "2. Виберіть файли",
    guideChooseBody: "Виберіть на телефоні до 10 фото або PDF.",
    guideChooseBodyHancom:
      "Виберіть на телефоні до 10 фото, PDF або підтримуваних HWP/HWPX файлів.",
    helpFile:
      "Виберіть одну або кілька фотографій чи документів. До 10 файлів за одне завдання друку.",
    helpPreview:
      "Перевірте список і порядок. Кожен файл друкується один раз, потім натисніть кнопку друку.",
  },
};

export function printBatchCopy(locale: SupportedLocale): PrintBatchCopy {
  return COPY[locale];
}

export function formatBatchCopy(template: string, count: number): string {
  return template.replaceAll("{{count}}", String(count));
}

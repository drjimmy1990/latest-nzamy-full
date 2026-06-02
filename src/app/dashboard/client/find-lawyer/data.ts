// find-lawyer/data.ts — Single source of truth for lawyer mock data
// FIX-01: Merged from find-lawyer/page.tsx (8 lawyers) and [id]/page.tsx (4 lawyers only)

export interface Lawyer {
  id: string;
  name: string;
  specialty: string;
  specialtyKey: string;
  city: string;
  rating: number;
  reviewCount: number;
  experienceYears: number;
  available: boolean;
  verified: boolean;
  priceMin: number;
  priceMax: number;
  expertise: string[];
  avatar: string;
  responseTime: string;
  successRate: number;
  consultationsCount: number;
  bio: string;
}

export const MOCK_LAWYERS: Lawyer[] = [
  {
    id: '1', name: 'فيصل الغامدي', specialty: 'قانون العمل والتوظيف', specialtyKey: 'labor',
    city: 'الرياض', rating: 4.8, reviewCount: 127, experienceYears: 12,
    available: true, verified: true, priceMin: 200, priceMax: 500,
    expertise: ['فصل تعسفي', 'مكافأة نهاية الخدمة', 'نزاعات عمالية', 'تعديل عقد العمل', 'اشتراطات التأمينات'],
    avatar: 'https://ui-avatars.com/api/?name=فيصل+الغامدي&background=0B3D2E&color=C8A762&size=128&bold=true&font-size=0.4',
    responseTime: 'خلال ساعة', successRate: 94, consultationsCount: 312,
    bio: 'محامٍ متخصص في قضايا العمل والتوظيف، عضو هيئة المحامين السعوديين، حاصل على ماجستير القانون التجاري من جامعة الملك سعود. خبرة تتجاوز ١٢ سنة في المحاكم العمالية.',
  },
  {
    id: '2', name: 'ريم الشهراني', specialty: 'القانون التجاري والشركات', specialtyKey: 'commercial',
    city: 'جدة', rating: 4.9, reviewCount: 89, experienceYears: 9,
    available: true, verified: true, priceMin: 300, priceMax: 800,
    expertise: ['عقود تجارية', 'نزاعات الشركاء', 'عمليات الاستحواذ', 'الغرامات التجارية', 'تأسيس الشركات'],
    avatar: 'https://ui-avatars.com/api/?name=ريم+الشهراني&background=C8A762&color=fff&size=128&bold=true&font-size=0.4',
    responseTime: 'خلال ساعتين', successRate: 91, consultationsCount: 198,
    bio: 'محامية ذات خبرة واسعة في القانون التجاري والعقود، تتميز بمهارات تفاوض عالية وسجل حافل في نزاعات الشركاء والاستحواذ.',
  },
  {
    id: '3', name: 'خالد المطيري', specialty: 'العقارات والتوثيق', specialtyKey: 'real-estate',
    city: 'الدمام', rating: 4.7, reviewCount: 204, experienceYears: 15,
    available: false, verified: true, priceMin: 150, priceMax: 400,
    expertise: ['عقارات', 'توثيق عقود', 'نزاعات الملكية', 'تقسيم الإرث', 'صكوك الأراضي'],
    avatar: 'https://ui-avatars.com/api/?name=خالد+المطيري&background=334155&color=fff&size=128&bold=true&font-size=0.4',
    responseTime: 'خلال يوم', successRate: 88, consultationsCount: 441,
    bio: 'خبير عقاري قانوني بخبرة ١٥ عاماً في توثيق العقارات وتسوية النزاعات، يتميز بمعرفة عميقة بإجراءات وزارة العدل وأنظمة التسجيل العقاري.',
  },
  {
    id: '4', name: 'سارة الزهراني', specialty: 'قانون الأسرة والأحوال الشخصية', specialtyKey: 'family',
    city: 'الرياض', rating: 4.6, reviewCount: 63, experienceYears: 7,
    available: true, verified: true, priceMin: 250, priceMax: 600,
    expertise: ['طلاق وخلع', 'حضانة', 'نفقة وميراث', 'عقد الزواج', 'الولاية'],
    avatar: 'https://ui-avatars.com/api/?name=سارة+الزهراني&background=7c3aed&color=fff&size=128&bold=true&font-size=0.4',
    responseTime: 'خلال ٣ ساعات', successRate: 90, consultationsCount: 143,
    bio: 'محامية متخصصة في شؤون الأسرة والأحوال الشخصية، تقدم خدمات قانونية احترافية بأسلوب متفهم وحساس لطبيعة هذه القضايا.',
  },
  {
    id: '5', name: 'محمد الدوسري', specialty: 'القانون الجنائي والجزائي', specialtyKey: 'criminal',
    city: 'جدة', rating: 4.7, reviewCount: 151, experienceYears: 11,
    available: true, verified: true, priceMin: 400, priceMax: 1200,
    expertise: ['قضايا جنائية', 'استئناف أحكام', 'تحكيم', 'النقض والمراجعة', 'الجرائم الإلكترونية'],
    avatar: 'https://ui-avatars.com/api/?name=محمد+الدوسري&background=991b1b&color=fff&size=128&bold=true&font-size=0.4',
    responseTime: 'خلال ٤ ساعات', successRate: 87, consultationsCount: 267,
    bio: 'محامٍ جنائي بارز بخبرة ١١ عاماً في القضايا الجزائية والاستئنافات أمام المحاكم العليا، متخصص في قضايا النقض والجرائم الإلكترونية.',
  },
  {
    id: '6', name: 'نورة العتيبي', specialty: 'الملكية الفكرية والتقنية', specialtyKey: 'ip',
    city: 'الرياض', rating: 4.9, reviewCount: 47, experienceYears: 6,
    available: true, verified: true, priceMin: 350, priceMax: 900,
    expertise: ['علامات تجارية', 'براءات اختراع', 'عقود تقنية', 'حماية البرمجيات', 'العقود الرقمية'],
    avatar: 'https://ui-avatars.com/api/?name=نورة+العتيبي&background=0369a1&color=fff&size=128&bold=true&font-size=0.4',
    responseTime: 'خلال ساعتين', successRate: 96, consultationsCount: 89,
    bio: 'محامية متخصصة في الملكية الفكرية والتقنية، حاصلة على شهادة متخصصة في قانون الملكية الفكرية الدولي. خبيرة في تسجيل العلامات التجارية وحماية البرمجيات.',
  },
  {
    id: '7', name: 'عبدالرحمن الحربي', specialty: 'قانون الشركات والاستثمار', specialtyKey: 'corporate',
    city: 'مكة', rating: 4.5, reviewCount: 38, experienceYears: 8,
    available: true, verified: true, priceMin: 300, priceMax: 700,
    expertise: ['تأسيس شركات', 'عقود استثمار', 'نزاعات تجارية', 'اندماج الشركات', 'حوكمة الشركات'],
    avatar: 'https://ui-avatars.com/api/?name=عبدالرحمن+الحربي&background=065f46&color=fff&size=128&bold=true&font-size=0.4',
    responseTime: 'خلال يوم', successRate: 85, consultationsCount: 74,
    bio: 'مستشار قانوني للشركات والاستثمار، متخصص في تأسيس الشركات وصياغة عقود الاستثمار وحوكمة الشركات وفق أنظمة هيئة السوق المالية.',
  },
  {
    id: '8', name: 'منيرة القحطاني', specialty: 'القانون المدني', specialtyKey: 'civil',
    city: 'الدمام', rating: 4.6, reviewCount: 92, experienceYears: 10,
    available: false, verified: true, priceMin: 200, priceMax: 550,
    expertise: ['مطالبات مدنية', 'عقود', 'تعويضات', 'التزامات تعاقدية', 'الدعاوى الحقوقية'],
    avatar: 'https://ui-avatars.com/api/?name=منيرة+القحطاني&background=9d174d&color=fff&size=128&bold=true&font-size=0.4',
    responseTime: 'خلال ٦ ساعات', successRate: 89, consultationsCount: 178,
    bio: 'محامية مدنية متمرسة بخبرة ١٠ سنوات في المحاكم العامة والتجارية، متخصصة في صياغة العقود والمطالبات التعويضية والدعاوى الحقوقية.',
  },
];

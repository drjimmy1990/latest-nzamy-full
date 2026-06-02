interface CaseSummary {
  topic: string;
  parties: string;
  financials: string;
  urgency: "high" | "medium" | "low";
}

interface StatuteCard {
  title: string;
  subtitle: string;
  text: string;
}

interface DiagnosticQuestion {
  id: string;
  question: string;
  options: string[];
}

interface RoadmapItem {
  step: number;
  title: string;
  desc: string;
}

export interface Message {
  id: string;
  role: "user" | "ai" | "system";
  text?: string;
  time: string;
  
  // Structured AI content
  summary?: CaseSummary;
  directAnswer?: string;
  statutes?: StatuteCard[];
  questions?: DiagnosticQuestion[];
  roadmap?: RoadmapItem[];
  
  // State variables for interactive timeline items within this message
  completedRoadmapSteps?: number[];
}

export const handleDownloadPDF = (msg: Message) => {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const summaryHtml = msg.summary ? `
    <div class="section">
      <div class="section-title">موجز الوقائع والاستخلاص الأولي</div>
      <table class="table">
        <tr>
          <th>الموضوع</th>
          <td>${msg.summary.topic}</td>
        </tr>
        <tr>
          <th>أطراف النزاع</th>
          <td>${msg.summary.parties}</td>
        </tr>
        <tr>
          <th>المبالغ المالية</th>
          <td>${msg.summary.financials}</td>
        </tr>
        <tr>
          <th>مستوى الاستعجال</th>
          <td>${msg.summary.urgency === "high" ? "مرتفع جداً" : "متوسط"}</td>
        </tr>
      </table>
    </div>
  ` : "";

  const statutesHtml = msg.statutes ? `
    <div class="section">
      <div class="section-title">السند القانوني والمواد النظامية</div>
      ${msg.statutes.map(s => `
        <div class="statute-box">
          <div class="statute-header">
            <strong>${s.title}</strong> - <span style="color:#C8A762">${s.subtitle}</span>
          </div>
          <div class="statute-body">${s.text}</div>
        </div>
      `).join("")}
    </div>
  ` : "";

  const roadmapHtml = msg.roadmap ? `
    <div class="section">
      <div class="section-title">خريطة الطريق والخطوات التنفيذية</div>
      <ul class="roadmap-list">
        ${msg.roadmap.map(r => `
          <li>
            <strong>الخطوة ${r.step}: ${r.title}</strong>
            <p>${r.desc}</p>
          </li>
        `).join("")}
      </ul>
    </div>
  ` : "";

  printWindow.document.write(`
    <html dir="rtl" lang="ar">
    <head>
      <title>تقرير استشارة قانونية - نظامي AI</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #ffffff;
          color: #1f2937;
          margin: 40px;
          line-height: 1.6;
        }
        .header {
          border-bottom: 3px solid #0B3D2E;
          padding-bottom: 20px;
          margin-bottom: 30px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .logo-title {
          font-size: 24px;
          font-weight: bold;
          color: #0B3D2E;
        }
        .date {
          font-size: 12px;
          color: #6b7280;
        }
        .title {
          font-size: 20px;
          font-weight: bold;
          color: #111827;
          margin-bottom: 20px;
          text-align: center;
        }
        .section {
          margin-bottom: 30px;
        }
        .section-title {
          font-size: 16px;
          font-weight: bold;
          color: #0B3D2E;
          border-right: 4px solid #C8A762;
          padding-right: 10px;
          margin-bottom: 15px;
        }
        .table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        .table th, .table td {
          border: 1px solid #e5e7eb;
          padding: 12px;
          text-align: right;
        }
        .table th {
          background-color: #f9fafb;
          width: 30%;
          font-weight: bold;
        }
        .answer {
          background-color: #f9fafb;
          border: 1px solid #e5e7eb;
          border-right: 4px solid #10b981;
          padding: 20px;
          border-radius: 8px;
          white-space: pre-wrap;
          font-size: 14px;
        }
        .statute-box {
          border: 1px solid #e5e7eb;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 15px;
          background-color: #ffffff;
        }
        .statute-header {
          font-size: 13px;
          margin-bottom: 8px;
          border-bottom: 1px solid #f3f4f6;
          padding-bottom: 8px;
        }
        .statute-body {
          font-size: 12px;
          color: #4b5563;
        }
        .roadmap-list {
          list-style: none;
          padding: 0;
        }
        .roadmap-list li {
          margin-bottom: 15px;
          padding-right: 20px;
          position: relative;
        }
        .roadmap-list li::before {
          content: "•";
          color: #C8A762;
          font-size: 20px;
          position: absolute;
          right: 0;
          top: -2px;
        }
        .footer {
          border-top: 1px solid #e5e7eb;
          padding-top: 15px;
          margin-top: 50px;
          text-align: center;
          font-size: 10px;
          color: #9ca3af;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo-title">نظامي AI • المستشار القانوني الذكي</div>
        <div class="date">تاريخ الاصدار: ${new Date().toLocaleDateString("ar-SA")}</div>
      </div>
      
      <div class="title">تقرير استشارة وتشخيص قانوني رسمي</div>
      
      ${summaryHtml}
      
      <div class="section">
        <div class="section-title">التشخيص والإجابة القانونية المباشرة</div>
        <div class="answer">${msg.directAnswer || ""}</div>
      </div>
      
      ${statutesHtml}
      
      ${roadmapHtml}
      
      <div class="footer">
        هذا التقرير تم توليده بواسطة محرك نظامي AI لأغراض استرشادية فقط ولا يحل محل التوكيل أو الاستشارة القانونية الرسمية من محامٍ مرخص.
      </div>
      
      <script>
        window.onload = function() {
          window.print();
          window.onafterprint = function() {
            window.close();
          };
        };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
};

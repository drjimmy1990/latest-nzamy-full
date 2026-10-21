import ConsultantGate from "@/components/dashboard/ConsultantGate";
import { LawyerDeadlinesPanel } from "../_components/LawyerDeadlinesPanel";

export default function LawyerDeadlinesRoute() {
  return <ConsultantGate><LawyerDeadlinesPanel /></ConsultantGate>;
}

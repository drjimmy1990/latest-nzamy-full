import { useState } from "react";
import { ConsultationType, ScheduleMode } from "@/components/consultation/constants";

export function useConsultationForm() {
  const [step, setStep] = useState(1);
  const [specialty, setSpecialty] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [consultType, setConsultType] = useState<ConsultationType | null>(null);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>(null);
  const [calDay, setCalDay] = useState<string | null>(null);
  const [calTime, setCalTime] = useState<string | null>(null);
  const [asapDone, setAsapDone] = useState(false);
  const [instantSearching, setInstantSearching] = useState(false);
  const [instantFound, setInstantFound] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [dir, setDir] = useState(1);

  const canNext = () => {
    if (step === 1) return !!specialty;
    if (step === 2) return description.length >= 20;
    if (step === 3) {
      if (!consultType) return false;
      if (consultType === "ai") return true;
      return scheduleMode !== null && (
        scheduleMode === "asap" ||
        (scheduleMode === "instant" && instantFound) ||
        (scheduleMode === "calendar" && !!calTime)
      );
    }
    return true;
  };

  const handleInstantSearch = async () => {
    setInstantSearching(true);
    await new Promise(r => setTimeout(r, 2200));
    setInstantSearching(false);
    setInstantFound(true);
  };

  const goNext = () => { setDir(1); setStep(s => s + 1); };
  const goPrev = () => { setDir(-1); setStep(s => s - 1); };

  return {
    step, setStep,
    specialty, setSpecialty,
    description, setDescription,
    files, setFiles,
    consultType, setConsultType,
    scheduleMode, setScheduleMode,
    calDay, setCalDay,
    calTime, setCalTime,
    asapDone, setAsapDone,
    instantSearching, setInstantSearching,
    instantFound, setInstantFound,
    confirmed, setConfirmed,
    dir, setDir,
    canNext,
    handleInstantSearch,
    goNext,
    goPrev
  };
}

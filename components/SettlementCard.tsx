import { PaymentInstruction } from "@/lib/settlement";
import { ArrowRight } from "lucide-react";

export default function SettlementCard({ instruction }: { instruction: PaymentInstruction }) {
  return (
    <div className="flex items-center gap-3 bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3">
      <span className="font-semibold text-sm" style={{ color: instruction.from.color }}>
        {instruction.from.name}
      </span>
      <div className="flex items-center gap-2 text-slate-500">
        <ArrowRight size={16} />
        <span className="text-white font-bold text-sm">RM {instruction.amount.toFixed(2)}</span>
        <ArrowRight size={16} />
      </div>
      <span className="font-semibold text-sm" style={{ color: instruction.to.color }}>
        {instruction.to.name}
      </span>
    </div>
  );
}

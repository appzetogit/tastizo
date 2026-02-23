import { Button } from "@/components/ui/button"
import { formatCurrency } from "../../restaurant/utils/currency"

export default function AvailableCashLimit({ onClose, walletData = {} }) {
  const rawLimit = Number(walletData.totalCashLimit)
  const totalCashLimit = Number.isFinite(rawLimit) && rawLimit >= 0 ? rawLimit : 0
  const cashInHand = Number(walletData.cashInHand) || 0
  const deductions = Number(walletData.deductions) || 0
  const pocketWithdrawals = Number(walletData.pocketWithdrawals) || 0
  const settlementAdjustment = Number(walletData.settlementAdjustment) || 0

  const availableLimit = totalCashLimit - cashInHand - deductions + pocketWithdrawals - settlementAdjustment

  return (
    <>
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
          <div className="text-center mb-6">
            <p className="text-gray-500 text-sm mb-1">Current available limit</p>
            <h2 className="text-3xl font-bold text-black">{formatCurrency(availableLimit)}</h2>
          </div>

          <div className="space-y-3 pt-2">
            <DetailRow label="Total cash limit" value={formatCurrency(totalCashLimit)} />
            <DetailRow label="Cash in hand" value={`-${formatCurrency(cashInHand)}`} color="text-red-600" />
            <DetailRow label="Deductions" value={`-${formatCurrency(deductions)}`} color="text-red-600" />
            <DetailRow label="Pocket withdrawals" value={formatCurrency(pocketWithdrawals)} color="text-green-600" />
            {settlementAdjustment !== 0 && (
              <DetailRow
                label="Settlement adjustment"
                value={settlementAdjustment > 0 ? `-${formatCurrency(settlementAdjustment)}` : `+${formatCurrency(Math.abs(settlementAdjustment))}`}
                color={settlementAdjustment > 0 ? "text-red-600" : "text-green-600"}
              />
            )}
          </div>
        </div>

        <div className="bg-blue-50 rounded-lg p-4 border border-blue-100 mt-2">
          <p className="text-xs text-blue-800 leading-relaxed">
            Aapki available cash limit calculate ki jati hai aapki total limit mein se cash-in-hand aur deductions ko subtract karke, aur pocket withdrawals ko add karke.
          </p>
        </div>
      </div>

      <div className="pt-4 mt-auto">
        <Button
          onClick={onClose}
          className="w-full bg-black hover:bg-gray-800 text-white font-semibold py-4 rounded-xl"
        >
          Okay, got it
        </Button>
      </div>
    </>
  )
}

function DetailRow({ label, value, color = "text-black" }) {
  return (
    <div className="py-2 flex justify-between items-center border-b border-gray-100 last:border-0">
      <div className="text-sm font-medium text-gray-700">{label}</div>
      <div className={`text-sm font-semibold ${color}`}>{value}</div>
    </div>
  )
}

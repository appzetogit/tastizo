import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { IndianRupee, Loader2 } from "lucide-react"
import { userAPI } from "@/lib/api"
import { initRazorpayPayment } from "@/lib/utils/razorpay"
import { toast } from "sonner"
import { getCompanyNameAsync } from "@/lib/utils/businessSettings"

export default function AddMoneyModal({ open, onOpenChange, onSuccess }) {
  const [amount, setAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)

  const quickAmounts = [100, 250, 500, 1000, 2000, 5000]

  const formatRupees = (value) => `\u20b9${value}`

  const handleAmountSelect = (selectedAmount) => {
    setAmount(selectedAmount.toString())
  }

  const handleAmountChange = (event) => {
    const value = event.target.value.replace(/[^0-9.]/g, "")
    if (value === "" || (parseFloat(value) >= 1 && parseFloat(value) <= 50000)) {
      setAmount(value)
    }
  }

  const handleAddMoney = async () => {
    const amountNum = parseFloat(amount)

    if (!amount || Number.isNaN(amountNum) || amountNum < 1) {
      toast.error(`Please enter a valid amount (minimum ${formatRupees(1)})`)
      return
    }

    if (amountNum > 50000) {
      toast.error(`Maximum amount is ${formatRupees("50,000")}`)
      return
    }

    try {
      setLoading(true)

      console.log("Creating wallet top-up order for amount:", amountNum)
      const orderResponse = await userAPI.createWalletTopupOrder(amountNum)
      console.log("Order response:", orderResponse)

      const { razorpay } = orderResponse.data.data

      if (!razorpay || !razorpay.orderId || !razorpay.key) {
        console.error("Invalid Razorpay response:", { razorpay, orderResponse })
        throw new Error("Failed to initialize payment gateway")
      }

      setLoading(false)
      onOpenChange(false)

      await new Promise((resolve) => setTimeout(resolve, 100))

      setProcessing(true)

      let userInfo = {}
      try {
        const userResponse = await userAPI.getProfile()
        userInfo = userResponse?.data?.data?.user || userResponse?.data?.user || {}
      } catch (error) {
        console.warn("Could not fetch user profile for Razorpay prefill:", error)
      }

      const userPhone = userInfo.phone || ""
      const userEmail = userInfo.email || ""
      const userName = userInfo.name || ""
      const formattedPhone = userPhone.replace(/\D/g, "").slice(-10)
      const companyName = await getCompanyNameAsync()

      await initRazorpayPayment({
        key: razorpay.key,
        amount: razorpay.amount,
        currency: razorpay.currency || "INR",
        order_id: razorpay.orderId,
        name: companyName,
        description: `Wallet Top-up - ${formatRupees(amountNum.toFixed(2))}`,
        prefill: {
          name: userName,
          email: userEmail,
          contact: formattedPhone,
        },
        notes: {
          type: "wallet_topup",
          amount: amountNum.toString(),
        },
        handler: async (response) => {
          try {
            await userAPI.verifyWalletTopupPayment({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
              amount: amountNum,
            })

            toast.success(`${formatRupees(amountNum)} added to wallet successfully!`)
            setAmount("")
            setProcessing(false)
            onOpenChange(false)

            if (onSuccess) {
              onSuccess()
            }
          } catch (error) {
            console.error("Payment verification error:", error)
            toast.error(
              error?.response?.data?.message ||
                "Payment verification failed. Please contact support.",
            )
            setProcessing(false)
          }
        },
        onError: (error) => {
          console.error("Razorpay payment error:", error)
          toast.error(error?.description || "Payment failed. Please try again.")
          setProcessing(false)
        },
        onClose: () => {
          setProcessing(false)
        },
      })
    } catch (error) {
      console.error("Error creating payment order:", error)
      console.error("Error response:", error?.response)
      console.error("Error response data:", error?.response?.data)

      let errorMessage = "Failed to initialize payment. Please try again."

      if (error?.response?.data) {
        if (error.response.data.message) {
          errorMessage = error.response.data.message
        } else if (error.response.data.error) {
          errorMessage = error.response.data.error
        } else if (typeof error.response.data === "string") {
          errorMessage = error.response.data
        }
      } else if (error?.message) {
        errorMessage = error.message
      }

      console.error("Final error message:", errorMessage)
      toast.error(errorMessage)
      setLoading(false)
      setProcessing(false)
    }
  }

  const handleClose = () => {
    if (!loading && !processing) {
      setAmount("")
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md max-h-[calc(100vh-1.5rem)] overflow-y-auto rounded-2xl px-4 py-4 sm:px-6 sm:py-6">
        <DialogHeader className="pr-8 sm:pr-10">
          <DialogTitle className="text-lg sm:text-xl md:text-2xl font-bold leading-tight text-gray-900 dark:text-white">
            Add Money to Wallet
          </DialogTitle>
          <DialogDescription className="text-sm sm:text-[15px] text-gray-600 dark:text-gray-400">
            Enter the amount you want to add to your wallet
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3 sm:space-y-5 sm:py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Enter Amount
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <IndianRupee className="h-4 w-4 text-gray-400 sm:h-5 sm:w-5" />
              </div>
              <Input
                type="text"
                value={amount}
                onChange={handleAmountChange}
                placeholder="Enter amount"
                className="h-11 pl-9 text-base sm:h-12 sm:pl-10 sm:text-lg"
                disabled={loading || processing}
              />
            </div>
            <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
              Minimum: {formatRupees(1)} | Maximum: {formatRupees("50,000")}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Quick Select
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {quickAmounts.map((quickAmount) => (
                <Button
                  key={quickAmount}
                  type="button"
                  variant={amount === quickAmount.toString() ? "default" : "outline"}
                  className="h-10 text-sm sm:h-11 sm:text-base"
                  onClick={() => handleAmountSelect(quickAmount)}
                  disabled={loading || processing}
                >
                  {formatRupees(quickAmount)}
                </Button>
              ))}
            </div>
          </div>

          <Button
            onClick={handleAddMoney}
            disabled={!amount || loading || processing || parseFloat(amount) < 1}
            className="w-full h-11 bg-green-600 text-sm font-semibold text-white hover:bg-green-700 sm:h-12 sm:text-base"
          >
            {loading || processing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {loading ? "Processing..." : "Opening Payment Gateway..."}
              </>
            ) : (
              `Add ${formatRupees(amount || "0")}`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

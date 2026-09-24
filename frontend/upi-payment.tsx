import { useEffect, useMemo, useState } from "react";
import { IndianRupee, Smartphone } from "lucide-react";
import QRCode from "qrcode";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "./api";
import { money } from "@/lib/store";

export function UpiPaymentButton({
  order,
  balance,
  vendorId,
  reload,
  setMessage,
}: {
  order: any;
  balance: number;
  vendorId: string;
  reload: () => Promise<void>;
  setMessage: (value: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [qr, setQr] = useState(""),
    [amount, setAmount] = useState(balance),
    [busy, setBusy] = useState(false);
  const upi = useMemo(() => {
    const params = new URLSearchParams({
      pa: order.payment_upi_id || "",
      pn: order.payment_payee_name || order.business_name,
      am: Number(amount || 0).toFixed(2),
      cu: "INR",
      tn: "Order " + order.id.slice(0, 8).toUpperCase(),
    });
    return "upi://pay?" + params.toString();
  }, [order, amount]);
  useEffect(() => {
    if (open && order.payment_upi_id)
      QRCode.toDataURL(upi, {
        width: 260,
        margin: 1,
        errorCorrectionLevel: "M",
      })
        .then(setQr)
        .catch(() => setQr(""));
  }, [open, upi, order.payment_upi_id]);
  if (!order.payment_upi_id)
    return (
      <span className="notice compact">Wholesaler UPI is not configured.</span>
    );
  return (
    <>
      <button
        className="btn primary"
        onClick={() => {
          setAmount(balance);
          setOpen(true);
        }}
      >
        <IndianRupee size={16} />
        Pay pending amount
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="upi-dialog">
          <DialogTitle>Pay {order.business_name}</DialogTitle>
          <DialogDescription>
            Scan with any UPI app, pay, then submit the transaction reference
            for wholesaler confirmation.
          </DialogDescription>
          <div className="upi-payment-card">
            {qr ? (
              <img src={qr} alt={"UPI QR to pay " + order.business_name} />
            ) : (
              <div className="qr-placeholder">Preparing QR…</div>
            )}
            <b>{money(Number(amount || 0))}</b>
            <small>{order.payment_upi_id}</small>
            <a className="btn" href={upi}>
              <Smartphone size={16} />
              Open UPI app
            </a>
          </div>
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              try {
                await api(
                  "/api/marketplace/requests/" + order.id + "/payment-submit",
                  {
                    vendorId,
                    amount: Number(f.get("amount")),
                    reference: f.get("reference"),
                  },
                );
                setOpen(false);
                setMessage(
                  "Payment submitted. Waiting for wholesaler confirmation.",
                );
                await reload();
              } catch (error) {
                setMessage((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Amount
              <input
                name="amount"
                type="number"
                min=".01"
                max={balance}
                step=".01"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                required
              />
            </label>
            <label>
              UPI transaction reference
              <input
                name="reference"
                minLength={4}
                maxLength={200}
                placeholder="Example: 426512345678"
                required
              />
            </label>
            <button className="btn primary" disabled={busy}>
              {busy ? "Submitting…" : "I paid — send for confirmation"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

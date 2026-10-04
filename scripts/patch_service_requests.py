import sys

file_path = r"src/app/api/v1/service-requests/route.ts"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

target1 = """    const requestedStatus =
      typeof requestData.status === "string" ? requestData.status : undefined;
    const status =
      requestedStatus && CREATE_STATUS_ALLOWLIST.has(requestedStatus)
        ? requestedStatus
        : "pending_assignment";"""

repl1 = """    const requestedStatus =
      typeof requestData.status === "string" ? requestData.status : undefined;
    let status =
      requestedStatus && CREATE_STATUS_ALLOWLIST.has(requestedStatus)
        ? requestedStatus
        : "pending_assignment";

    // Council Gate: If this request requires payment (> 0) and payment is not confirmed completed,
    // it MUST start as pending_payment to prevent unfulfilled/unpaid orders masquerading as active work.
    if (isPaidRequest && payment?.status !== "completed") {
      status = "pending_payment";
    }"""

target2 = """    // In-app confirmation notification to the requester (best-effort).
    await recordNotification({
      userId: user.id,
      title: "تم استلام طلبك",
      body: `طلبك «${serviceRequest.title ?? ""}» قيد المعالجة وسنعلمك بأي تحديث.`,
      href: "/dashboard",
    });"""

repl2 = """    // In-app confirmation notification to the requester (best-effort).
    const notifTitle = status === "pending_payment" ? "طلبك بانتظار إتمام السداد" : "تم استلام طلبك";
    const notifBody = status === "pending_payment"
      ? `طلبك «${serviceRequest.title ?? ""}» تم إنشاؤه وبانتظار استكمال عملية الدفع.`
      : `طلبك «${serviceRequest.title ?? ""}» قيد المعالجة وسنعلمك بأي تحديث.`;

    await recordNotification({
      userId: user.id,
      title: notifTitle,
      body: notifBody,
      href: "/dashboard",
    });"""

if target1 not in content:
    print("Error: target1 not found in content!")
    sys.exit(1)

if target2 not in content:
    print("Error: target2 not found in content!")
    sys.exit(1)

content = content.replace(target1, repl1, 1)
content = content.replace(target2, repl2, 1)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Successfully patched service-requests route.ts")

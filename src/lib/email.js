const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

async function enviarRecordatorioCita({
  nombrePaciente, emailPaciente,
  fechaCita, tratamiento,
  nombreDoctor, telefono_clinica
}) {
  try {
    const fecha = new Date(fechaCita).toLocaleDateString('es-CL', {
      weekday: 'long', day: '2-digit',
      month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    await resend.emails.send({
      from: 'Jarvis OS <onboarding@resend.dev>',
      to: emailPaciente,
      subject: 'Recordatorio de cita — Jarvis OS',
      html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
    <div style="background:#7F77DD;padding:24px 32px">
      <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:3px">⬡ JARVIS OS</div>
      <div style="font-size:12px;color:rgba(255,255,255,.7);margin-top:4px">Sistema de Gestión Clínica</div>
    </div>
    <div style="padding:32px">
      <p style="font-size:16px;color:#1a1a1a;margin:0 0 8px">Estimado/a <strong>${nombrePaciente}</strong>,</p>
      <p style="font-size:14px;color:#555;margin:0 0 24px">Le recordamos que tiene una cita programada:</p>
      <div style="background:#f9f7ff;border-left:4px solid #7F77DD;border-radius:8px;padding:16px 20px;margin-bottom:24px">
        <div style="margin-bottom:8px">
          <span style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#888">Fecha y hora</span>
          <div style="font-size:15px;font-weight:600;color:#1a1a1a;margin-top:2px">${fecha}</div>
        </div>
        <div style="margin-bottom:8px">
          <span style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#888">Tratamiento</span>
          <div style="font-size:15px;font-weight:600;color:#1a1a1a;margin-top:2px">${tratamiento}</div>
        </div>
        <div>
          <span style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#888">Doctor/a</span>
          <div style="font-size:15px;font-weight:600;color:#1a1a1a;margin-top:2px">${nombreDoctor}</div>
        </div>
      </div>
      <p style="font-size:13px;color:#555;margin:0 0 6px">Si necesita cancelar o reagendar, contáctenos:</p>
      <p style="font-size:14px;font-weight:600;color:#7F77DD;margin:0 0 24px">${telefono_clinica}</p>
      <p style="font-size:12px;color:#888;margin:0">Por favor llegue 5 minutos antes de su hora.</p>
    </div>
    <div style="background:#f4f4f6;padding:16px 32px;text-align:center">
      <p style="font-size:11px;color:#aaa;margin:0">Jarvis OS — Sistema de Gestión Clínica</p>
    </div>
  </div>
</body>
</html>`
    });
    return { ok: true };
  } catch(e) {
    console.error('Email error:', e);
    return { ok: false, error: e.message };
  }
}

async function enviarRecetaPDF({ nombrePaciente, emailPaciente, nombreDoctor }) {
  try {
    await resend.emails.send({
      from: 'Jarvis OS <onboarding@resend.dev>',
      to: emailPaciente,
      subject: 'Receta médica — Jarvis OS',
      html: `
<body style="font-family:-apple-system,sans-serif;padding:40px;color:#1a1a1a">
  <h2 style="color:#7F77DD">⬡ JARVIS OS</h2>
  <p>Estimado/a <strong>${nombrePaciente}</strong>,</p>
  <p>El/la <strong>${nombreDoctor}</strong> ha emitido una receta médica para usted.</p>
  <p>Puede solicitar una copia en la clínica.</p>
  <p style="color:#888;font-size:12px">Jarvis OS — Sistema de Gestión Clínica</p>
</body>`
    });
    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { enviarRecordatorioCita, enviarRecetaPDF };
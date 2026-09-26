import aiosmtplib
from email.message import EmailMessage

from app.config import get_settings

settings = get_settings()


async def send_password_reset_email(to_email: str, reset_link: str, language: str = "EN") -> None:
    subject_by_lang = {
        "EN": "Password reset — Business Analytics Platform",
        "PL": "Resetowanie hasła — Business Analytics Platform",
        "RU": "Восстановление пароля — Business Analytics Platform",
    }
    body_by_lang = {
        "EN": f"Click the link to reset your password (valid for 1 hour):\n{reset_link}",
        "PL": f"Kliknij link, aby zresetować hasło (link aktywny 1 godzinę):\n{reset_link}",
        "RU": f"Перейдите по ссылке, чтобы сбросить пароль (ссылка активна 1 час):\n{reset_link}",
    }
    lang = language if language in subject_by_lang else "EN"

    message = EmailMessage()
    message["From"] = f"{settings.mail_from_name} <{settings.mail_from_address}>"
    message["To"] = to_email
    message["Subject"] = subject_by_lang[lang]
    message.set_content(body_by_lang[lang])

    await aiosmtplib.send(
        message,
        hostname=settings.mail_host,
        port=settings.mail_port,
        username=settings.mail_username,
        password=settings.mail_password,
        start_tls=settings.mail_use_tls,
    )

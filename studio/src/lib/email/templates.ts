import { DEFAULT_LOCALE, type Locale } from "../../i18n/config";
import { interpolate } from "../../i18n/utils";

export type EmailTemplate =
  | "email_verification"
  | "password_reset"
  | "magic_link"
  | "welcome"
  | "payment_succeeded"
  | "payment_refunded"
  | "subscription_started"
  | "subscription_canceled"
  | "subscription_expiring"
  | "account_deleted"
  | "team_invitation";

export interface TemplateCopy {
  subject: string;
  heading: string;
  body: string;
  action: string;
  footer: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const EN: Record<EmailTemplate, TemplateCopy> = {
  email_verification: {
    subject: "Verify your {appName} email",
    heading: "Confirm your email",
    body: "Confirm {email} to finish creating your {appName} account. The link expires in one hour.",
    action: "Verify email",
    footer: "If you did not create this account you can ignore this message.",
  },
  password_reset: {
    subject: "Reset your {appName} password",
    heading: "Reset your password",
    body: "We received a request to reset the password for {email}. The link expires in one hour.",
    action: "Set a new password",
    footer: "If you did not request this, your password stays unchanged.",
  },
  magic_link: {
    subject: "Your {appName} sign-in link",
    heading: "Sign in without a password",
    body: "Use the link below to sign in as {email}. It expires in fifteen minutes and works once.",
    action: "Sign in",
    footer: "Never forward this link. Anyone holding it can sign in as you.",
  },
  welcome: {
    subject: "Welcome to {appName}",
    heading: "Your account is ready",
    body: "Thanks for joining {appName}, {name}. Open the dashboard to set up your first project.",
    action: "Open dashboard",
    footer: "Reply to this email if you need help getting started.",
  },
  payment_succeeded: {
    subject: "Your {appName} payment succeeded",
    heading: "Payment received",
    body: "We received {amount} for {appName}. Your receipt and invoice are available in billing.",
    action: "View billing",
    footer: "Keep this message for your records.",
  },
  payment_refunded: {
    subject: "Your {appName} payment was refunded",
    heading: "Refund issued",
    body: "We refunded {amount}. Depending on your bank it can take up to ten days to appear.",
    action: "View billing",
    footer: "Contact support if the refund does not arrive.",
  },
  subscription_started: {
    subject: "Your {appName} {plan} plan is active",
    heading: "Subscription active",
    body: "The {plan} plan is now active. The next renewal is scheduled for {date}.",
    action: "Manage subscription",
    footer: "You can upgrade, downgrade or cancel at any time.",
  },
  subscription_canceled: {
    subject: "Your {appName} subscription was canceled",
    heading: "Subscription canceled",
    body: "The {plan} plan is canceled. You keep access until {date}.",
    action: "Reactivate",
    footer: "Tell us what went wrong so we can improve.",
  },
  subscription_expiring: {
    subject: "Your {appName} subscription ends soon",
    heading: "Access ends {date}",
    body: "The {plan} plan ends on {date}. Renew now to keep your data and limits.",
    action: "Renew plan",
    footer: "Nothing is deleted immediately after the plan ends.",
  },
  account_deleted: {
    subject: "Your {appName} account was deleted",
    heading: "Account deleted",
    body: "The account for {email} and its data were removed. This cannot be undone.",
    action: "Create a new account",
    footer: "If this was not you, contact support immediately.",
  },
  team_invitation: {
    subject: "{inviter} invited you to {team}",
    heading: "You have an invitation",
    body: "{inviter} invited you to join {team} on {appName}. The invitation expires in seven days.",
    action: "Accept invitation",
    footer: "You can ignore this email if you do not know the sender.",
  },
};

const ES: Record<EmailTemplate, TemplateCopy> = {
  email_verification: {
    subject: "Verifica tu correo de {appName}",
    heading: "Confirma tu correo",
    body: "Confirma {email} para terminar de crear tu cuenta de {appName}. El enlace caduca en una hora.",
    action: "Verificar correo",
    footer: "Si no creaste esta cuenta puedes ignorar este mensaje.",
  },
  password_reset: {
    subject: "Restablece tu contraseña de {appName}",
    heading: "Restablece tu contraseña",
    body: "Recibimos una solicitud para restablecer la contraseña de {email}. El enlace caduca en una hora.",
    action: "Definir nueva contraseña",
    footer: "Si no lo solicitaste, tu contraseña no cambia.",
  },
  magic_link: {
    subject: "Tu enlace de acceso a {appName}",
    heading: "Entra sin contraseña",
    body: "Usa el enlace para entrar como {email}. Caduca en quince minutos y funciona una sola vez.",
    action: "Iniciar sesión",
    footer: "Nunca reenvíes este enlace. Quien lo tenga puede entrar como tú.",
  },
  welcome: {
    subject: "Bienvenido a {appName}",
    heading: "Tu cuenta está lista",
    body: "Gracias por unirte a {appName}, {name}. Abre el panel y crea tu primer proyecto.",
    action: "Abrir el panel",
    footer: "Responde a este correo si necesitas ayuda.",
  },
  payment_succeeded: {
    subject: "Tu pago en {appName} se realizó",
    heading: "Pago recibido",
    body: "Recibimos {amount} para {appName}. El recibo y la factura están en facturación.",
    action: "Ver facturación",
    footer: "Guarda este mensaje como comprobante.",
  },
  payment_refunded: {
    subject: "Tu pago en {appName} fue reembolsado",
    heading: "Reembolso emitido",
    body: "Reembolsamos {amount}. Según tu banco puede tardar hasta diez días en aparecer.",
    action: "Ver facturación",
    footer: "Contacta con soporte si el reembolso no llega.",
  },
  subscription_started: {
    subject: "Tu plan {plan} de {appName} está activo",
    heading: "Suscripción activa",
    body: "El plan {plan} ya está activo. La próxima renovación es el {date}.",
    action: "Gestionar suscripción",
    footer: "Puedes cambiar o cancelar el plan cuando quieras.",
  },
  subscription_canceled: {
    subject: "Tu suscripción a {appName} fue cancelada",
    heading: "Suscripción cancelada",
    body: "El plan {plan} está cancelado. Mantienes el acceso hasta el {date}.",
    action: "Reactivar",
    footer: "Cuéntanos qué falló para poder mejorar.",
  },
  subscription_expiring: {
    subject: "Tu suscripción a {appName} termina pronto",
    heading: "El acceso termina el {date}",
    body: "El plan {plan} termina el {date}. Renueva ahora para conservar tus datos y límites.",
    action: "Renovar plan",
    footer: "No se borra nada inmediatamente al terminar el plan.",
  },
  account_deleted: {
    subject: "Tu cuenta de {appName} fue eliminada",
    heading: "Cuenta eliminada",
    body: "La cuenta de {email} y sus datos fueron eliminados. Esto no se puede deshacer.",
    action: "Crear una cuenta nueva",
    footer: "Si no fuiste tú, contacta con soporte de inmediato.",
  },
  team_invitation: {
    subject: "{inviter} te invitó a {team}",
    heading: "Tienes una invitación",
    body: "{inviter} te invitó a unirte a {team} en {appName}. La invitación caduca en siete días.",
    action: "Aceptar invitación",
    footer: "Ignora este correo si no conoces al remitente.",
  },
};

const FR: Record<EmailTemplate, TemplateCopy> = {
  email_verification: {
    subject: "Vérifiez votre e-mail {appName}",
    heading: "Confirmez votre e-mail",
    body: "Confirmez {email} pour terminer la création de votre compte {appName}. Le lien expire dans une heure.",
    action: "Vérifier l'e-mail",
    footer: "Si vous n'avez pas créé ce compte, ignorez ce message.",
  },
  password_reset: {
    subject: "Réinitialisez votre mot de passe {appName}",
    heading: "Réinitialisez votre mot de passe",
    body: "Nous avons reçu une demande de réinitialisation pour {email}. Le lien expire dans une heure.",
    action: "Définir un mot de passe",
    footer: "Sans action de votre part, le mot de passe reste inchangé.",
  },
  magic_link: {
    subject: "Votre lien de connexion {appName}",
    heading: "Connectez-vous sans mot de passe",
    body: "Utilisez ce lien pour vous connecter en tant que {email}. Il expire dans quinze minutes.",
    action: "Se connecter",
    footer: "Ne transférez jamais ce lien. Il permet de se connecter à votre place.",
  },
  welcome: {
    subject: "Bienvenue sur {appName}",
    heading: "Votre compte est prêt",
    body: "Merci d'avoir rejoint {appName}, {name}. Ouvrez le tableau de bord pour créer un projet.",
    action: "Ouvrir le tableau de bord",
    footer: "Répondez à cet e-mail si vous avez besoin d'aide.",
  },
  payment_succeeded: {
    subject: "Votre paiement {appName} est confirmé",
    heading: "Paiement reçu",
    body: "Nous avons reçu {amount} pour {appName}. Le reçu et la facture sont dans la facturation.",
    action: "Voir la facturation",
    footer: "Conservez ce message comme justificatif.",
  },
  payment_refunded: {
    subject: "Votre paiement {appName} a été remboursé",
    heading: "Remboursement émis",
    body: "Nous avons remboursé {amount}. Selon votre banque, cela peut prendre dix jours.",
    action: "Voir la facturation",
    footer: "Contactez le support si le remboursement n'arrive pas.",
  },
  subscription_started: {
    subject: "Votre offre {plan} {appName} est active",
    heading: "Abonnement actif",
    body: "L'offre {plan} est active. Le prochain renouvellement est prévu le {date}.",
    action: "Gérer l'abonnement",
    footer: "Vous pouvez changer ou annuler à tout moment.",
  },
  subscription_canceled: {
    subject: "Votre abonnement {appName} est annulé",
    heading: "Abonnement annulé",
    body: "L'offre {plan} est annulée. Vous gardez l'accès jusqu'au {date}.",
    action: "Réactiver",
    footer: "Dites-nous ce qui n'a pas fonctionné.",
  },
  subscription_expiring: {
    subject: "Votre abonnement {appName} se termine bientôt",
    heading: "Accès jusqu'au {date}",
    body: "L'offre {plan} se termine le {date}. Renouvelez pour conserver vos données et vos limites.",
    action: "Renouveler",
    footer: "Rien n'est supprimé immédiatement après la fin.",
  },
  account_deleted: {
    subject: "Votre compte {appName} a été supprimé",
    heading: "Compte supprimé",
    body: "Le compte {email} et ses données ont été supprimés. Cette action est définitive.",
    action: "Créer un compte",
    footer: "Si ce n'était pas vous, contactez le support immédiatement.",
  },
  team_invitation: {
    subject: "{inviter} vous invite dans {team}",
    heading: "Vous avez une invitation",
    body: "{inviter} vous invite à rejoindre {team} sur {appName}. L'invitation expire dans sept jours.",
    action: "Accepter l'invitation",
    footer: "Ignorez cet e-mail si vous ne connaissez pas l'expéditeur.",
  },
};

const DE: Record<EmailTemplate, TemplateCopy> = {
  email_verification: {
    subject: "Bestätigen Sie Ihre {appName} E-Mail",
    heading: "E-Mail bestätigen",
    body: "Bestätigen Sie {email}, um Ihr {appName} Konto fertigzustellen. Der Link läuft in einer Stunde ab.",
    action: "E-Mail bestätigen",
    footer: "Wenn Sie dieses Konto nicht erstellt haben, ignorieren Sie diese Nachricht.",
  },
  password_reset: {
    subject: "Setzen Sie Ihr {appName} Passwort zurück",
    heading: "Passwort zurücksetzen",
    body: "Wir haben eine Anfrage für {email} erhalten. Der Link läuft in einer Stunde ab.",
    action: "Neues Passwort setzen",
    footer: "Ohne Ihre Aktion bleibt das Passwort unverändert.",
  },
  magic_link: {
    subject: "Ihr {appName} Anmeldelink",
    heading: "Ohne Passwort anmelden",
    body: "Melden Sie sich mit diesem Link als {email} an. Er gilt fünfzehn Minuten und nur einmal.",
    action: "Anmelden",
    footer: "Leiten Sie diesen Link nie weiter.",
  },
  welcome: {
    subject: "Willkommen bei {appName}",
    heading: "Ihr Konto ist bereit",
    body: "Danke, dass Sie {appName} nutzen, {name}. Öffnen Sie das Dashboard für Ihr erstes Projekt.",
    action: "Dashboard öffnen",
    footer: "Antworten Sie auf diese E-Mail, wenn Sie Hilfe brauchen.",
  },
  payment_succeeded: {
    subject: "Ihre {appName} Zahlung war erfolgreich",
    heading: "Zahlung erhalten",
    body: "Wir haben {amount} für {appName} erhalten. Beleg und Rechnung finden Sie in der Abrechnung.",
    action: "Abrechnung ansehen",
    footer: "Bewahren Sie diese Nachricht als Nachweis auf.",
  },
  payment_refunded: {
    subject: "Ihre {appName} Zahlung wurde erstattet",
    heading: "Erstattung ausgelöst",
    body: "Wir haben {amount} erstattet. Je nach Bank dauert es bis zu zehn Tage.",
    action: "Abrechnung ansehen",
    footer: "Melden Sie sich beim Support, falls die Erstattung ausbleibt.",
  },
  subscription_started: {
    subject: "Ihr {appName} {plan} Tarif ist aktiv",
    heading: "Abonnement aktiv",
    body: "Der Tarif {plan} ist aktiv. Die nächste Verlängerung ist am {date}.",
    action: "Abonnement verwalten",
    footer: "Sie können jederzeit wechseln oder kündigen.",
  },
  subscription_canceled: {
    subject: "Ihr {appName} Abonnement wurde gekündigt",
    heading: "Abonnement gekündigt",
    body: "Der Tarif {plan} ist gekündigt. Der Zugang bleibt bis {date} bestehen.",
    action: "Reaktivieren",
    footer: "Sagen Sie uns, was nicht gepasst hat.",
  },
  subscription_expiring: {
    subject: "Ihr {appName} Abonnement endet bald",
    heading: "Zugang endet am {date}",
    body: "Der Tarif {plan} endet am {date}. Verlängern Sie, um Daten und Limits zu behalten.",
    action: "Tarif verlängern",
    footer: "Nach dem Ende wird nichts sofort gelöscht.",
  },
  account_deleted: {
    subject: "Ihr {appName} Konto wurde gelöscht",
    heading: "Konto gelöscht",
    body: "Das Konto {email} und seine Daten wurden entfernt. Das lässt sich nicht rückgängig machen.",
    action: "Neues Konto erstellen",
    footer: "Waren Sie das nicht, wenden Sie sich sofort an den Support.",
  },
  team_invitation: {
    subject: "{inviter} lädt Sie zu {team} ein",
    heading: "Sie haben eine Einladung",
    body: "{inviter} lädt Sie zu {team} auf {appName} ein. Die Einladung gilt sieben Tage.",
    action: "Einladung annehmen",
    footer: "Ignorieren Sie diese E-Mail, wenn Sie den Absender nicht kennen.",
  },
};

const PT: Record<EmailTemplate, TemplateCopy> = {
  email_verification: {
    subject: "Verifique seu e-mail no {appName}",
    heading: "Confirme seu e-mail",
    body: "Confirme {email} para concluir sua conta no {appName}. O link expira em uma hora.",
    action: "Verificar e-mail",
    footer: "Se você não criou esta conta, ignore esta mensagem.",
  },
  password_reset: {
    subject: "Redefina sua senha do {appName}",
    heading: "Redefina sua senha",
    body: "Recebemos um pedido de redefinição para {email}. O link expira em uma hora.",
    action: "Definir nova senha",
    footer: "Sem ação sua, a senha continua a mesma.",
  },
  magic_link: {
    subject: "Seu link de acesso ao {appName}",
    heading: "Entre sem senha",
    body: "Use o link para entrar como {email}. Ele expira em quinze minutos e funciona uma vez.",
    action: "Entrar",
    footer: "Nunca encaminhe este link.",
  },
  welcome: {
    subject: "Bem-vindo ao {appName}",
    heading: "Sua conta está pronta",
    body: "Obrigado por entrar no {appName}, {name}. Abra o painel e crie seu primeiro projeto.",
    action: "Abrir painel",
    footer: "Responda a este e-mail se precisar de ajuda.",
  },
  payment_succeeded: {
    subject: "Seu pagamento no {appName} foi aprovado",
    heading: "Pagamento recebido",
    body: "Recebemos {amount} para o {appName}. O recibo e a nota estão em faturamento.",
    action: "Ver faturamento",
    footer: "Guarde esta mensagem como comprovante.",
  },
  payment_refunded: {
    subject: "Seu pagamento no {appName} foi estornado",
    heading: "Estorno emitido",
    body: "Estornamos {amount}. Conforme o banco, pode levar até dez dias para aparecer.",
    action: "Ver faturamento",
    footer: "Fale com o suporte se o estorno não chegar.",
  },
  subscription_started: {
    subject: "Seu plano {plan} do {appName} está ativo",
    heading: "Assinatura ativa",
    body: "O plano {plan} está ativo. A próxima renovação é em {date}.",
    action: "Gerenciar assinatura",
    footer: "Você pode mudar ou cancelar quando quiser.",
  },
  subscription_canceled: {
    subject: "Sua assinatura do {appName} foi cancelada",
    heading: "Assinatura cancelada",
    body: "O plano {plan} foi cancelado. O acesso continua até {date}.",
    action: "Reativar",
    footer: "Conte o que deu errado para melhorarmos.",
  },
  subscription_expiring: {
    subject: "Sua assinatura do {appName} termina em breve",
    heading: "Acesso até {date}",
    body: "O plano {plan} termina em {date}. Renove para manter dados e limites.",
    action: "Renovar plano",
    footer: "Nada é apagado logo após o término.",
  },
  account_deleted: {
    subject: "Sua conta do {appName} foi excluída",
    heading: "Conta excluída",
    body: "A conta {email} e seus dados foram removidos. Isso não pode ser desfeito.",
    action: "Criar nova conta",
    footer: "Se não foi você, fale com o suporte imediatamente.",
  },
  team_invitation: {
    subject: "{inviter} convidou você para {team}",
    heading: "Você tem um convite",
    body: "{inviter} convidou você para {team} no {appName}. O convite expira em sete dias.",
    action: "Aceitar convite",
    footer: "Ignore este e-mail se não conhece o remetente.",
  },
};

const IT: Record<EmailTemplate, TemplateCopy> = {
  email_verification: {
    subject: "Verifica la tua e-mail di {appName}",
    heading: "Conferma la tua e-mail",
    body: "Conferma {email} per completare il tuo account {appName}. Il link scade tra un'ora.",
    action: "Verifica e-mail",
    footer: "Se non hai creato questo account, ignora il messaggio.",
  },
  password_reset: {
    subject: "Reimposta la password di {appName}",
    heading: "Reimposta la password",
    body: "Abbiamo ricevuto una richiesta per {email}. Il link scade tra un'ora.",
    action: "Imposta una nuova password",
    footer: "Senza azione la password resta invariata.",
  },
  magic_link: {
    subject: "Il tuo link di accesso a {appName}",
    heading: "Accedi senza password",
    body: "Usa il link per accedere come {email}. Scade tra quindici minuti e vale una volta.",
    action: "Accedi",
    footer: "Non inoltrare mai questo link.",
  },
  welcome: {
    subject: "Benvenuto su {appName}",
    heading: "Il tuo account è pronto",
    body: "Grazie per esserti unito a {appName}, {name}. Apri la dashboard e crea il primo progetto.",
    action: "Apri la dashboard",
    footer: "Rispondi a questa e-mail se ti serve aiuto.",
  },
  payment_succeeded: {
    subject: "Il pagamento su {appName} è riuscito",
    heading: "Pagamento ricevuto",
    body: "Abbiamo ricevuto {amount} per {appName}. Ricevuta e fattura sono nella fatturazione.",
    action: "Vedi fatturazione",
    footer: "Conserva questo messaggio come ricevuta.",
  },
  payment_refunded: {
    subject: "Il pagamento su {appName} è stato rimborsato",
    heading: "Rimborso emesso",
    body: "Abbiamo rimborsato {amount}. Secondo la banca possono servire fino a dieci giorni.",
    action: "Vedi fatturazione",
    footer: "Contatta il supporto se il rimborso non arriva.",
  },
  subscription_started: {
    subject: "Il piano {plan} di {appName} è attivo",
    heading: "Abbonamento attivo",
    body: "Il piano {plan} è attivo. Il prossimo rinnovo è il {date}.",
    action: "Gestisci abbonamento",
    footer: "Puoi cambiare o annullare quando vuoi.",
  },
  subscription_canceled: {
    subject: "L'abbonamento a {appName} è stato annullato",
    heading: "Abbonamento annullato",
    body: "Il piano {plan} è annullato. Mantieni l'accesso fino al {date}.",
    action: "Riattiva",
    footer: "Raccontaci cosa non ha funzionato.",
  },
  subscription_expiring: {
    subject: "L'abbonamento a {appName} sta per finire",
    heading: "Accesso fino al {date}",
    body: "Il piano {plan} termina il {date}. Rinnova per mantenere dati e limiti.",
    action: "Rinnova piano",
    footer: "Nulla viene cancellato subito dopo la scadenza.",
  },
  account_deleted: {
    subject: "Il tuo account {appName} è stato eliminato",
    heading: "Account eliminato",
    body: "L'account {email} e i suoi dati sono stati rimossi. L'operazione è definitiva.",
    action: "Crea un nuovo account",
    footer: "Se non sei stato tu, contatta subito il supporto.",
  },
  team_invitation: {
    subject: "{inviter} ti ha invitato in {team}",
    heading: "Hai un invito",
    body: "{inviter} ti ha invitato in {team} su {appName}. L'invito scade tra sette giorni.",
    action: "Accetta invito",
    footer: "Ignora questa e-mail se non conosci il mittente.",
  },
};

const JA: Record<EmailTemplate, TemplateCopy> = {
  email_verification: {
    subject: "{appName} のメールアドレスを確認してください",
    heading: "メールアドレスの確認",
    body: "{email} を確認して {appName} のアカウント作成を完了してください。リンクは1時間で失効します。",
    action: "メールを確認",
    footer: "このアカウントに心当たりがない場合は無視してください。",
  },
  password_reset: {
    subject: "{appName} のパスワードを再設定",
    heading: "パスワードの再設定",
    body: "{email} のパスワード再設定リクエストを受け取りました。リンクは1時間で失効します。",
    action: "新しいパスワードを設定",
    footer: "操作しなければパスワードは変わりません。",
  },
  magic_link: {
    subject: "{appName} のログインリンク",
    heading: "パスワードなしでログイン",
    body: "このリンクで {email} としてログインできます。15分間有効で、一度だけ使えます。",
    action: "ログイン",
    footer: "このリンクは絶対に転送しないでください。",
  },
  welcome: {
    subject: "{appName} へようこそ",
    heading: "アカウントの準備ができました",
    body: "{name} さん、{appName} をご利用いただきありがとうございます。ダッシュボードから最初のプロジェクトを作成してください。",
    action: "ダッシュボードを開く",
    footer: "お困りの場合はこのメールに返信してください。",
  },
  payment_succeeded: {
    subject: "{appName} のお支払いが完了しました",
    heading: "お支払いを受領しました",
    body: "{appName} のお支払い {amount} を受領しました。領収書と請求書は請求ページにあります。",
    action: "請求を確認",
    footer: "このメールは控えとして保管してください。",
  },
  payment_refunded: {
    subject: "{appName} のお支払いを返金しました",
    heading: "返金を実行しました",
    body: "{amount} を返金しました。金融機関により反映まで最大10日かかります。",
    action: "請求を確認",
    footer: "返金が届かない場合はサポートへご連絡ください。",
  },
  subscription_started: {
    subject: "{appName} の {plan} プランが有効になりました",
    heading: "サブスクリプション有効",
    body: "{plan} プランが有効になりました。次回の更新日は {date} です。",
    action: "サブスクリプションを管理",
    footer: "プラン変更と解約はいつでも可能です。",
  },
  subscription_canceled: {
    subject: "{appName} のサブスクリプションを解約しました",
    heading: "サブスクリプション解約",
    body: "{plan} プランは解約されました。{date} まではご利用いただけます。",
    action: "再開する",
    footer: "改善のため、解約理由をお聞かせください。",
  },
  subscription_expiring: {
    subject: "{appName} のサブスクリプションがまもなく終了します",
    heading: "{date} に終了します",
    body: "{plan} プランは {date} に終了します。データと上限を保つには更新してください。",
    action: "プランを更新",
    footer: "終了直後にデータが削除されることはありません。",
  },
  account_deleted: {
    subject: "{appName} のアカウントを削除しました",
    heading: "アカウント削除",
    body: "{email} のアカウントとデータを削除しました。元に戻すことはできません。",
    action: "新しいアカウントを作成",
    footer: "心当たりがない場合はすぐにサポートへご連絡ください。",
  },
  team_invitation: {
    subject: "{inviter} さんが {team} に招待しています",
    heading: "招待が届いています",
    body: "{inviter} さんが {appName} の {team} にあなたを招待しました。招待は7日間有効です。",
    action: "招待を承認",
    footer: "差出人に心当たりがない場合は無視してください。",
  },
};

const KO: Record<EmailTemplate, TemplateCopy> = {
  email_verification: {
    subject: "{appName} 이메일을 인증하세요",
    heading: "이메일 확인",
    body: "{email} 을 확인해 {appName} 계정 생성을 완료하세요. 링크는 한 시간 뒤 만료됩니다.",
    action: "이메일 인증",
    footer: "본인이 만든 계정이 아니라면 이 메일을 무시하세요.",
  },
  password_reset: {
    subject: "{appName} 비밀번호 재설정",
    heading: "비밀번호 재설정",
    body: "{email} 의 비밀번호 재설정 요청을 받았습니다. 링크는 한 시간 뒤 만료됩니다.",
    action: "새 비밀번호 설정",
    footer: "아무 작업도 하지 않으면 비밀번호는 그대로입니다.",
  },
  magic_link: {
    subject: "{appName} 로그인 링크",
    heading: "비밀번호 없이 로그인",
    body: "아래 링크로 {email} 계정에 로그인하세요. 15분 동안 한 번만 사용할 수 있습니다.",
    action: "로그인",
    footer: "이 링크는 절대 전달하지 마세요.",
  },
  welcome: {
    subject: "{appName} 에 오신 것을 환영합니다",
    heading: "계정이 준비되었습니다",
    body: "{name} 님, {appName} 에 가입해 주셔서 감사합니다. 대시보드에서 첫 프로젝트를 만들어 보세요.",
    action: "대시보드 열기",
    footer: "도움이 필요하면 이 메일에 회신해 주세요.",
  },
  payment_succeeded: {
    subject: "{appName} 결제가 완료되었습니다",
    heading: "결제 완료",
    body: "{appName} 결제 {amount} 을 받았습니다. 영수증과 청구서는 결제 페이지에 있습니다.",
    action: "결제 내역 보기",
    footer: "이 메일을 증빙으로 보관하세요.",
  },
  payment_refunded: {
    subject: "{appName} 결제가 환불되었습니다",
    heading: "환불 처리",
    body: "{amount} 을 환불했습니다. 은행에 따라 최대 10일이 걸릴 수 있습니다.",
    action: "결제 내역 보기",
    footer: "환불이 도착하지 않으면 고객지원에 문의하세요.",
  },
  subscription_started: {
    subject: "{appName} {plan} 요금제가 활성화되었습니다",
    heading: "구독 활성화",
    body: "{plan} 요금제가 활성화되었습니다. 다음 갱신일은 {date} 입니다.",
    action: "구독 관리",
    footer: "요금제 변경과 해지는 언제든 가능합니다.",
  },
  subscription_canceled: {
    subject: "{appName} 구독이 해지되었습니다",
    heading: "구독 해지",
    body: "{plan} 요금제가 해지되었습니다. {date} 까지는 계속 이용할 수 있습니다.",
    action: "다시 시작",
    footer: "개선을 위해 해지 이유를 알려주세요.",
  },
  subscription_expiring: {
    subject: "{appName} 구독이 곧 종료됩니다",
    heading: "{date} 에 종료",
    body: "{plan} 요금제가 {date} 에 종료됩니다. 데이터와 한도를 유지하려면 갱신하세요.",
    action: "요금제 갱신",
    footer: "종료 직후 데이터가 삭제되지는 않습니다.",
  },
  account_deleted: {
    subject: "{appName} 계정이 삭제되었습니다",
    heading: "계정 삭제",
    body: "{email} 계정과 데이터를 삭제했습니다. 되돌릴 수 없습니다.",
    action: "새 계정 만들기",
    footer: "본인이 아니라면 즉시 고객지원에 문의하세요.",
  },
  team_invitation: {
    subject: "{inviter} 님이 {team} 에 초대했습니다",
    heading: "초대가 도착했습니다",
    body: "{inviter} 님이 {appName} 의 {team} 에 초대했습니다. 초대는 7일 동안 유효합니다.",
    action: "초대 수락",
    footer: "보낸 사람을 모른다면 이 메일을 무시하세요.",
  },
};

const ZH: Record<EmailTemplate, TemplateCopy> = {
  email_verification: {
    subject: "验证你的 {appName} 邮箱",
    heading: "确认邮箱",
    body: "确认 {email} 以完成 {appName} 账号创建。链接一小时后失效。",
    action: "验证邮箱",
    footer: "如果这不是你创建的账号，可以忽略本邮件。",
  },
  password_reset: {
    subject: "重设你的 {appName} 密码",
    heading: "重设密码",
    body: "我们收到了 {email} 的密码重设请求。链接一小时后失效。",
    action: "设置新密码",
    footer: "如果不是你发起的，密码保持不变。",
  },
  magic_link: {
    subject: "你的 {appName} 登录链接",
    heading: "免密码登录",
    body: "使用下面的链接以 {email} 身份登录。链接十五分钟内有效且只能使用一次。",
    action: "立即登录",
    footer: "请勿转发此链接，任何持有者都能以你的身份登录。",
  },
  welcome: {
    subject: "欢迎使用 {appName}",
    heading: "账号已就绪",
    body: "{name}，感谢加入 {appName}。打开控制台创建第一个项目吧。",
    action: "打开控制台",
    footer: "需要帮助可以直接回复本邮件。",
  },
  payment_succeeded: {
    subject: "{appName} 支付成功",
    heading: "已收到付款",
    body: "我们已收到 {appName} 的付款 {amount}。收据和发票可在账单页查看。",
    action: "查看账单",
    footer: "请保留本邮件作为凭证。",
  },
  payment_refunded: {
    subject: "{appName} 付款已退款",
    heading: "退款已发起",
    body: "我们已退款 {amount}。到账时间取决于发卡行，最长可能需要十天。",
    action: "查看账单",
    footer: "如果退款未到账，请联系客服。",
  },
  subscription_started: {
    subject: "{appName} {plan} 套餐已生效",
    heading: "订阅已生效",
    body: "{plan} 套餐已生效，下次续费日期为 {date}。",
    action: "管理订阅",
    footer: "你可以随时升级、降级或取消。",
  },
  subscription_canceled: {
    subject: "{appName} 订阅已取消",
    heading: "订阅已取消",
    body: "{plan} 套餐已取消，你可以使用到 {date}。",
    action: "重新订阅",
    footer: "欢迎告诉我们取消原因，帮助我们改进。",
  },
  subscription_expiring: {
    subject: "{appName} 订阅即将到期",
    heading: "{date} 到期",
    body: "{plan} 套餐将在 {date} 到期。续费即可保留数据和额度。",
    action: "续费套餐",
    footer: "到期后数据不会立即删除。",
  },
  account_deleted: {
    subject: "{appName} 账号已注销",
    heading: "账号已注销",
    body: "{email} 的账号和数据已删除，此操作无法撤销。",
    action: "重新注册",
    footer: "如果不是你本人操作，请立即联系客服。",
  },
  team_invitation: {
    subject: "{inviter} 邀请你加入 {team}",
    heading: "你收到一份邀请",
    body: "{inviter} 邀请你加入 {appName} 的 {team}，邀请七天内有效。",
    action: "接受邀请",
    footer: "如果不认识发件人，可以忽略本邮件。",
  },
};

export const EMAIL_COPY: Record<Locale, Record<EmailTemplate, TemplateCopy>> = {
  en: EN,
  es: ES,
  fr: FR,
  de: DE,
  pt: PT,
  it: IT,
  ja: JA,
  ko: KO,
  zh: ZH,
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function isSafeActionUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
  } catch {
    return false;
  }
}

export function renderEmail(
  template: EmailTemplate,
  locale: Locale,
  variables: Record<string, string | number>,
): RenderedEmail {
  const copy = (EMAIL_COPY[locale] || EMAIL_COPY[DEFAULT_LOCALE])[template];
  const subject = interpolate(copy.subject, variables);
  const heading = interpolate(copy.heading, variables);
  const body = interpolate(copy.body, variables);
  const footer = interpolate(copy.footer, variables);
  const actionUrl = typeof variables.url === "string" && isSafeActionUrl(variables.url)
    ? variables.url
    : null;
  const button = actionUrl
    ? '<p style="margin:24px 0"><a href="' + escapeHtml(actionUrl)
      + '" style="background:#111827;border-radius:8px;color:#ffffff;display:inline-block;'
      + 'font-weight:600;padding:12px 20px;text-decoration:none">' + escapeHtml(copy.action) + "</a></p>"
    : "";
  const html = '<div style="background:#f5f5f5;padding:32px 0">'
    + '<div style="background:#ffffff;border-radius:12px;color:#111827;font-family:'
    + "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.6;margin:0 auto;"
    + 'max-width:520px;padding:32px">'
    + '<h1 style="font-size:20px;margin:0 0 12px">' + escapeHtml(heading) + "</h1>"
    + "<p style=\"margin:0\">" + escapeHtml(body) + "</p>"
    + button
    + (actionUrl
      ? '<p style="color:#6b7280;font-size:12px;margin:0 0 16px;word-break:break-all">'
        + escapeHtml(actionUrl) + "</p>"
      : "")
    + '<p style="border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;margin:24px 0 0;'
    + 'padding-top:16px">' + escapeHtml(footer) + "</p>"
    + "</div></div>";
  const text = [heading, "", body, actionUrl ? "" : null, actionUrl, "", footer]
    .filter((line) => line !== null)
    .join("\n");
  return { subject, html, text };
}

import type { Locale } from "./config";
import type {
  GenerationStatus,
  GenerationErrorCode,
} from "../lib/generation/types";

export interface GenerationMessages {
  title: string;
  description: string;
  model: string;
  prompt: string;
  placeholder: string;
  submit: string;
  submitting: string;
  history: string;
  empty: string;
  unavailable: string;
  refresh: string;
  previous: string;
  next: string;
  result: string;
  submitError: string;
  invalidRequest: string;
  status: Record<GenerationStatus, string>;
  failure: Record<GenerationErrorCode, string>;
}

export const GENERATION_MESSAGES: Record<Locale, GenerationMessages> = {
  en: {
    invalidRequest: "Check the model, prompt and options, then try again.",
    title: "Create",
    description:
      "Describe your idea, start a generation, and find your results here.",
    model: "Model",
    prompt: "Prompt",
    placeholder: "Describe what you want to create…",
    submit: "Generate",
    submitting: "Submitting…",
    history: "Your generations",
    empty: "Your first creation starts with an idea.",
    unavailable: "Generation is not available yet. Please check back later.",
    refresh: "Refresh",
    previous: "Previous",
    next: "Next",
    result: "View result",
    submitError:
      "The submission could not be confirmed. Retry to check the same request.",
    status: {
      queued: "Queued",
      submitting: "Submitting",
      running: "Generating",
      succeeded: "Completed",
      failed: "Failed",
    },
    failure: {
      provider_failed: "Generation failed. You can start a new task.",
      invalid_result: "The service returned an invalid result.",
      provider_unavailable: "The generation service is unavailable.",
      submission_interrupted:
        "Submission was interrupted. Check the task before starting another.",
      generation_timeout: "This task exceeded its generation time limit.",
    },
  },
  es: {
    invalidRequest: "Revisa el modelo, las instrucciones y las opciones e inténtalo de nuevo.",
    title: "Crear",
    description:
      "Describe tu idea, inicia una generación y encuentra aquí los resultados.",
    model: "Modelo",
    prompt: "Instrucciones",
    placeholder: "Describe lo que quieres crear…",
    submit: "Generar",
    submitting: "Enviando…",
    history: "Tus generaciones",
    empty: "Tu primera creación empieza con una idea.",
    unavailable: "La generación aún no está disponible. Vuelve más tarde.",
    refresh: "Actualizar",
    previous: "Anterior",
    next: "Siguiente",
    result: "Ver resultado",
    submitError:
      "No se pudo confirmar el envío. Reintenta para consultar la misma solicitud.",
    status: {
      queued: "En cola",
      submitting: "Enviando",
      running: "Generando",
      succeeded: "Completada",
      failed: "Fallida",
    },
    failure: {
      provider_failed: "La generación falló. Puedes crear otra tarea.",
      invalid_result: "El servicio devolvió un resultado no válido.",
      provider_unavailable: "El servicio de generación no está disponible.",
      submission_interrupted:
        "El envío se interrumpió. Comprueba la tarea antes de crear otra.",
      generation_timeout: "La tarea superó su tiempo límite de generación.",
    },
  },
  fr: {
    invalidRequest: "Vérifiez le modèle, les instructions et les options, puis réessayez.",
    title: "Créer",
    description:
      "Décrivez votre idée, lancez une génération et retrouvez vos résultats ici.",
    model: "Modèle",
    prompt: "Instructions",
    placeholder: "Décrivez ce que vous souhaitez créer…",
    submit: "Générer",
    submitting: "Envoi…",
    history: "Vos créations",
    empty: "Votre première création commence par une idée.",
    unavailable:
      "La génération n’est pas encore disponible. Revenez plus tard.",
    refresh: "Actualiser",
    previous: "Précédent",
    next: "Suivant",
    result: "Voir le résultat",
    submitError:
      "L’envoi n’a pas pu être confirmé. Réessayez pour vérifier la même demande.",
    status: {
      queued: "En attente",
      submitting: "Envoi",
      running: "Génération",
      succeeded: "Terminée",
      failed: "Échec",
    },
    failure: {
      provider_failed:
        "La génération a échoué. Vous pouvez créer une nouvelle tâche.",
      invalid_result: "Le service a renvoyé un résultat invalide.",
      provider_unavailable: "Le service de génération est indisponible.",
      submission_interrupted:
        "L’envoi a été interrompu. Vérifiez la tâche avant d’en créer une autre.",
      generation_timeout: "Cette tâche a dépassé son délai de génération.",
    },
  },
  de: {
    invalidRequest: "Prüfe Modell, Beschreibung und Optionen und versuche es erneut.",
    title: "Erstellen",
    description:
      "Beschreibe deine Idee, starte die Generierung und finde hier deine Ergebnisse.",
    model: "Modell",
    prompt: "Beschreibung",
    placeholder: "Beschreibe, was du erstellen möchtest…",
    submit: "Generieren",
    submitting: "Wird gesendet…",
    history: "Deine Generierungen",
    empty: "Deine erste Kreation beginnt mit einer Idee.",
    unavailable:
      "Die Generierung ist noch nicht verfügbar. Schau später wieder vorbei.",
    refresh: "Aktualisieren",
    previous: "Zurück",
    next: "Weiter",
    result: "Ergebnis ansehen",
    submitError:
      "Die Übermittlung wurde nicht bestätigt. Prüfe dieselbe Anfrage durch erneutes Senden.",
    status: {
      queued: "Wartend",
      submitting: "Wird gesendet",
      running: "Wird generiert",
      succeeded: "Abgeschlossen",
      failed: "Fehlgeschlagen",
    },
    failure: {
      provider_failed:
        "Die Generierung ist fehlgeschlagen. Du kannst eine neue Aufgabe starten.",
      invalid_result: "Der Dienst hat ein ungültiges Ergebnis geliefert.",
      provider_unavailable: "Der Generierungsdienst ist nicht verfügbar.",
      submission_interrupted:
        "Die Übermittlung wurde unterbrochen. Prüfe die Aufgabe vor einer neuen Anfrage.",
      generation_timeout:
        "Die Generierungszeit dieser Aufgabe wurde überschritten.",
    },
  },
  pt: {
    invalidRequest: "Verifique o modelo, as instruções e as opções e tente novamente.",
    title: "Criar",
    description:
      "Descreva sua ideia, inicie uma geração e encontre seus resultados aqui.",
    model: "Modelo",
    prompt: "Instruções",
    placeholder: "Descreva o que deseja criar…",
    submit: "Gerar",
    submitting: "Enviando…",
    history: "Suas gerações",
    empty: "Sua primeira criação começa com uma ideia.",
    unavailable: "A geração ainda não está disponível. Volte mais tarde.",
    refresh: "Atualizar",
    previous: "Anterior",
    next: "Próximo",
    result: "Ver resultado",
    submitError:
      "Não foi possível confirmar o envio. Tente novamente para verificar a mesma solicitação.",
    status: {
      queued: "Na fila",
      submitting: "Enviando",
      running: "Gerando",
      succeeded: "Concluída",
      failed: "Falhou",
    },
    failure: {
      provider_failed: "A geração falhou. Você pode iniciar outra tarefa.",
      invalid_result: "O serviço retornou um resultado inválido.",
      provider_unavailable: "O serviço de geração está indisponível.",
      submission_interrupted:
        "O envio foi interrompido. Verifique a tarefa antes de iniciar outra.",
      generation_timeout: "Esta tarefa excedeu seu tempo limite de geração.",
    },
  },
  it: {
    invalidRequest: "Controlla modello, istruzioni e opzioni, poi riprova.",
    title: "Crea",
    description:
      "Descrivi la tua idea, avvia una generazione e trova qui i risultati.",
    model: "Modello",
    prompt: "Istruzioni",
    placeholder: "Descrivi cosa vuoi creare…",
    submit: "Genera",
    submitting: "Invio…",
    history: "Le tue generazioni",
    empty: "La tua prima creazione inizia con un’idea.",
    unavailable: "La generazione non è ancora disponibile. Riprova più tardi.",
    refresh: "Aggiorna",
    previous: "Precedente",
    next: "Successivo",
    result: "Visualizza risultato",
    submitError:
      "Invio non confermato. Riprova per verificare la stessa richiesta.",
    status: {
      queued: "In coda",
      submitting: "Invio",
      running: "Generazione",
      succeeded: "Completata",
      failed: "Non riuscita",
    },
    failure: {
      provider_failed:
        "Generazione non riuscita. Puoi avviare una nuova attività.",
      invalid_result: "Il servizio ha restituito un risultato non valido.",
      provider_unavailable: "Il servizio di generazione non è disponibile.",
      submission_interrupted:
        "Invio interrotto. Verifica l’attività prima di avviarne un’altra.",
      generation_timeout:
        "Questa attività ha superato il tempo massimo di generazione.",
    },
  },
  ja: {
    invalidRequest: "モデル、プロンプト、設定を確認して再試行してください。",
    title: "作成",
    description: "アイデアを入力して生成を開始し、ここで結果を確認できます。",
    model: "モデル",
    prompt: "プロンプト",
    placeholder: "作成したい内容を入力…",
    submit: "生成する",
    submitting: "送信中…",
    history: "生成履歴",
    empty: "最初の作品はアイデアから始まります。",
    unavailable: "生成機能はまだ利用できません。後ほどご確認ください。",
    refresh: "更新",
    previous: "前へ",
    next: "次へ",
    result: "結果を表示",
    submitError:
      "送信を確認できませんでした。再試行すると同じリクエストを確認できます。",
    status: {
      queued: "待機中",
      submitting: "送信中",
      running: "生成中",
      succeeded: "完了",
      failed: "失敗",
    },
    failure: {
      provider_failed: "生成に失敗しました。新しいタスクを作成できます。",
      invalid_result: "サービスから無効な結果が返されました。",
      provider_unavailable: "生成サービスを利用できません。",
      submission_interrupted:
        "送信が中断されました。新しいタスクを作成する前に確認してください。",
      generation_timeout: "生成の制限時間を超えました。",
    },
  },
  ko: {
    invalidRequest: "모델, 프롬프트와 옵션을 확인하고 다시 시도하세요.",
    title: "만들기",
    description:
      "아이디어를 설명하고 생성을 시작한 뒤 여기서 결과를 확인하세요.",
    model: "모델",
    prompt: "프롬프트",
    placeholder: "만들고 싶은 내용을 설명하세요…",
    submit: "생성",
    submitting: "제출 중…",
    history: "생성 기록",
    empty: "첫 작품은 아이디어에서 시작됩니다.",
    unavailable: "아직 생성 기능을 사용할 수 없습니다. 나중에 다시 확인하세요.",
    refresh: "새로고침",
    previous: "이전",
    next: "다음",
    result: "결과 보기",
    submitError:
      "제출을 확인하지 못했습니다. 다시 시도하면 동일한 요청을 확인합니다.",
    status: {
      queued: "대기 중",
      submitting: "제출 중",
      running: "생성 중",
      succeeded: "완료",
      failed: "실패",
    },
    failure: {
      provider_failed: "생성에 실패했습니다. 새 작업을 시작할 수 있습니다.",
      invalid_result: "서비스가 잘못된 결과를 반환했습니다.",
      provider_unavailable: "생성 서비스를 사용할 수 없습니다.",
      submission_interrupted:
        "제출이 중단되었습니다. 새 작업을 시작하기 전에 확인하세요.",
      generation_timeout: "작업의 생성 제한 시간을 초과했습니다.",
    },
  },
  zh: {
    invalidRequest: "请检查模型、提示词及生成参数后重试。",
    title: "创作",
    description: "描述你的想法，开始生成，并在这里查看结果。",
    model: "模型",
    prompt: "提示词",
    placeholder: "描述你想生成的内容…",
    submit: "开始生成",
    submitting: "正在提交…",
    history: "生成记录",
    empty: "从一个想法开始你的第一次创作。",
    unavailable: "生成服务暂未开放，请稍后再试。",
    refresh: "刷新",
    previous: "上一页",
    next: "下一页",
    result: "查看结果",
    submitError: "暂时无法确认提交结果，请重试以查询同一请求。",
    status: {
      queued: "排队中",
      submitting: "提交中",
      running: "生成中",
      succeeded: "已完成",
      failed: "失败",
    },
    failure: {
      provider_failed: "生成失败，可以重新创建任务。",
      invalid_result: "生成服务返回了无效结果。",
      provider_unavailable: "生成服务暂不可用。",
      submission_interrupted: "提交中断，请核对该任务后再决定是否重新创建。",
      generation_timeout: "任务已超过该模型的生成时限。",
    },
  },
};

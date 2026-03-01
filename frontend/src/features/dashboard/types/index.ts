export interface User {
    username: string;
    telephon: string;
    gmail: string;
    avatar_url?: string;
    wallpaper_url?: string;
    last_seen?: string;
}

export interface Contact {
    Username: string;
    Number: string;
    ContactName: string;
    Status: 'accepted' | 'pending';
    avatar_url?: string;
    wallpaper_url?: string;
    last_seen?: string;
}

export interface Message {
    MessageID: number | string;
    SenderTelephon: string;
    Receptor: string;
    Message: string;
    Status: 'enviado' | 'entregado' | 'visto';
    Time: string;
    Edited?: boolean;
    MediaUrl?: string;
    MediaType?: string;
    ReplyToMessageID?: number;
    ReplyToTelephon?: string;
    ReplyToMessage?: string;
    isDeleting?: boolean;
}

export interface ChatGroup {
    ContactTelephon: string;
    ContactUsername: string;
    ContactName: string;
    IsContact: boolean;
    Messages: Message[];
}

export interface CallState {
    roomID: string;
    remoteTelephon: string;
    remoteName: string;
    callType: 'voice' | 'video';
    role: 'caller' | 'receiver';
    status: 'ringing' | 'active';
}

export interface IncomingCall {
    from: string;
    username: string;
    roomID: string;
    callType: 'voice' | 'video';
}

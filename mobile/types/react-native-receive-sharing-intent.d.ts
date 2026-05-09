declare module 'react-native-receive-sharing-intent' {
  interface SharedFile {
    filePath?: string;
    text?: string;
    weblink?: string;
    mimeType?: string;
    contentUri?: string;
    fileName?: string;
    extension?: string;
    subject?: string;
  }

  interface ReceiveSharingIntentModule {
    getReceivedFiles(
      callback: (files: SharedFile[]) => void,
      errorCallback: (error: any) => void,
      protocol?: string,
    ): void;
    clearReceivedFiles(): void;
  }

  const ReceiveSharingIntent: ReceiveSharingIntentModule;
  export default ReceiveSharingIntent;
}

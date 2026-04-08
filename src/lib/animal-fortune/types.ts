export type AnimalId =
  | 'lion'
  | 'cheetah'
  | 'black-panther'
  | 'wolf'
  | 'koala'
  | 'monkey'
  | 'black-cat'
  | 'tanuki'
  | 'pegasus'
  | 'elephant'
  | 'sheep'
  | 'tiger';

export interface AnimalData {
  id: AnimalId;
  name: string;
  emoji: string;
  color: string;         // Tailwind bg-* class
  borderColor: string;   // Tailwind border-* class
  tagColor: string;      // Tailwind bg-* for badge

  /** 一言キャッチ */
  catchphrase: string;

  /** 結婚における性格特徴 */
  marriagePersonality: string[];

  /** 長所 */
  strengths: string[];

  /** 注意点 */
  weaknesses: string[];

  /** 理想のパートナー像 */
  idealPartner: string;

  /** 相性の良い動物タイプ */
  compatibleAnimals: AnimalId[];

  /** 結婚アドバイス */
  marriageAdvice: string;
}

export interface DiagnosisInput {
  nickname: string;
  birthdate: string; // YYYY-MM-DD
}

export interface DiagnosisResult {
  animal: AnimalData;
  compatible: AnimalData[];
}

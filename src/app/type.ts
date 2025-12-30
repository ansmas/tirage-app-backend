export type Session = {
     code: string;
     participants: string[];
     assignements: Record<string, string>
     users: Set<string>;
}
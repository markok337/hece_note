// Supabase는 한 번에 1000행까지만 돌려준다. 그보다 많은 표는 이어서 받아 합쳐야 빠지는 행이 없다.

/** 한 번에 받는 행 수. 서버의 기본 상한(1000)과 같거나 작아야 한다. */
export const PAGE_SIZE = 1000;

/** 한 쪽(from~to, 양끝 포함)을 받아 오는 함수. */
export type PageFetcher<T> = (from: number, to: number) => Promise<T[]>;

/** 쪽이 가득 차지 않을 때까지 이어서 받아 한 목록으로 합친다. */
export async function fetchAllPages<T>(fetchPage: PageFetcher<T>, pageSize: number = PAGE_SIZE): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

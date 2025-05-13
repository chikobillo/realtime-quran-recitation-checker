import { NextRequest, NextResponse } from 'next/server';

// Define a proper type for the ayah object
interface Ayah {
  text: string;
  [key: string]: unknown; // Allow other properties
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const surah = searchParams.get('surah');
  const startVerse = searchParams.get('startVerse');
  const endVerse = searchParams.get('endVerse');
  
  if (!surah) {
    return NextResponse.json({ error: 'Surah parameter is required' }, { status: 400 });
  }
  
  try {
    let url;
    
    // If start and end verses are specified, use offset and limit
    if (startVerse && endVerse) {
      // API is 0-indexed for offset, but our verses are 1-indexed
      const offset = parseInt(startVerse) - 1;
      const limit = parseInt(endVerse) - parseInt(startVerse) + 1;
      url = `https://api.alquran.cloud/v1/surah/${surah}?offset=${offset}&limit=${limit}`;
    } else if (startVerse) {
      // If only startVerse is specified, get just that verse
      const offset = parseInt(startVerse) - 1;
      url = `https://api.alquran.cloud/v1/surah/${surah}?offset=${offset}&limit=1`;
    } else {
      // Otherwise get the whole surah
      url = `https://api.alquran.cloud/v1/surah/${surah}`;
    }
    

    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json; charset=utf-8',
        'Content-Type': 'application/json; charset=utf-8'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Error fetching from Quran API:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Quran API' }, 
      { status: 500 }
    );
  }
}

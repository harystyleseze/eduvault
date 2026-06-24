export const dynamic = 'force-dynamic';

export async function accessStatus(db, materialId, buyerAddress) {
  if (!materialId || !buyerAddress) {
    return { error: 'Missing materialId or buyerAddress', statusCode: 400 };
  }

  const material = await db.collection('materials').findOne({ materialId });
  if (!material) {
    return { status: 'unavailable', detail: 'material not found' };
  }

  const buyer = String(buyerAddress).toLowerCase();

  // 1. Check entitlement cache first (fast path)
  const cached = await db.collection('entitlement_cache').findOne({
    materialId,
    buyerAddress: buyer,
  });
  if (cached?.active) {
    return { status: 'active', source: cached.source || 'cache' };
  }

  // 2. Check purchases DB for settled status
  const purchase = await db.collection('purchases').findOne({ materialId, buyerAddress: buyer });
  if (purchase) {
    if (purchase.status === 'settled') return { status: 'active', source: 'purchases-db' };
    return { status: 'pending', source: 'purchases-db' };
  }

  return { status: 'not_purchased', source: 'unknown' };
}

/**
 * GET /api/materials/access?materialId=&buyerAddress=
 * Returns a simple access status for a material for a buyer.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const materialId = searchParams.get('materialId') || '';
    const buyerAddress = searchParams.get('buyerAddress') || '';

    if (!materialId || !buyerAddress) {
      const { NextResponse } = await import('next/server');
      return NextResponse.json({ error: 'Missing materialId or buyerAddress' }, { status: 400 });
    }

    const { getDb } = await import('../../../../lib/mongodb.js');
    const db = await getDb();
    const result = await accessStatus(db, materialId, buyerAddress);
    const { NextResponse } = await import('next/server');

    if (result?.statusCode) {
      return NextResponse.json({ error: result.error }, { status: result.statusCode });
    }
    return NextResponse.json(result);
  } catch (err) {
    const { NextResponse } = await import('next/server');
    return NextResponse.json({ error: 'Failed to determine access status', detail: String(err?.message || err) }, { status: 500 });
  }
}

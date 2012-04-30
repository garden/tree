module UniquePerms (
    uniquePerms
    )
where

-- | Find all unique permutations of a list where there might be duplicates.
uniquePerms :: (Eq a) => [a] -> [[a]]
uniquePerms = permBag . makeBag

-- | An unordered collection where duplicate values are allowed,
-- but represented with a single value and a count.
type Bag a = [(a, Int)]

makeBag :: (Eq a) => [a] -> Bag a
makeBag [] = []
makeBag (a:as) = mix a $ makeBag as
  where
    mix a []                        = [(a,1)]
    mix a (bn@(b,n):bs) | a == b    = (b,n+1):bs
                        | otherwise = bn : mix a bs

permBag :: Bag a -> [[a]]
permBag [] = [[]]
permBag bs = concatMap (\(f,cs) -> map (f:) $ permBag cs) . oneOfEach $ bs
  where
    oneOfEach [] = []
    oneOfEach (an@(a,n):bs) =
        let bs' = if n == 1 then bs else (a,n-1):bs
        in (a,bs') : mapSnd (an:) (oneOfEach bs)
    
    apSnd f (a,b) = (a, f b)
    mapSnd = map . apSnd


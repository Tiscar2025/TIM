{-#LANGUAGE OverloadedStrings, ScopedTypeVariables, RecordWildCards, DeriveGeneric#-}
module Main where

import PluginType
import Snap.Http.Server
import Interpreter
                                
main :: IO ()
main = mkInterpreter >>= quickHttpServe . serve 

testInterp :: InterpreterMarkup 
testInterp = I "" [Example (Just "This is fun") "take 10 [1..]"
                  ,Example Nothing "reverse . reverse"]
                  [Goal "(==11)" "Great, that's eleven"]
